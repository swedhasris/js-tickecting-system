package com.connectit.core.service;

import com.connectit.core.model.SLABreach;
import com.connectit.core.model.Ticket;
import com.connectit.core.repository.SLABreachRepository;
import com.connectit.core.repository.TicketRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Optional;

@Service
public class SlaService {

    @Autowired
    private TicketRepository ticketRepository;

    @Autowired
    private SLABreachRepository slaBreachRepository;

    // Run every 15 minutes to check ticket SLA status (matching server.ts cron schedule)
    @Scheduled(cron = "0 */15 * * * *")
    public void escalateStaleTickets() {
        System.out.println("[SLA Engine] Running stale ticket SLA checks...");
        List<Ticket> openTickets = ticketRepository.findAllOpenTickets();

        LocalDateTime now = LocalDateTime.now();

        for (Ticket ticket : openTickets) {
            if ("On Hold".equals(ticket.getStatus()) || "Waiting for Customer".equals(ticket.getStatus())) {
                continue;
            }

            boolean isUpdated = false;

            // 1. Response SLA Check
            if (ticket.getResponseDeadline() != null && ticket.getFirstResponseAt() == null
                    && !"Breached".equals(ticket.getResponseSlaStatus()) && !"Completed".equals(ticket.getResponseSlaStatus())) {
                
                if (now.isAfter(ticket.getResponseDeadline())) {
                    ticket.setResponseSlaStatus("Breached");
                    isUpdated = true;
                    recordBreach(ticket, "Response SLA", ticket.getResponseDeadline());
                } else {
                    // Check if At Risk (remaining time < 20% of total window)
                    LocalDateTime start = ticket.getCreatedAt() != null ? ticket.getCreatedAt() : now;
                    long totalWindow = Duration.between(start, ticket.getResponseDeadline()).toMillis();
                    long remaining = Duration.between(now, ticket.getResponseDeadline()).toMillis();
                    if (totalWindow > 0 && remaining < totalWindow * 0.2) {
                        if (!"At Risk".equals(ticket.getResponseSlaStatus())) {
                            ticket.setResponseSlaStatus("At Risk");
                            isUpdated = true;
                        }
                    }
                }
            }

            // 2. Resolution SLA Check
            if (ticket.getResolutionDeadline() != null && ticket.getResolvedAt() == null
                    && !"Breached".equals(ticket.getResolutionSlaStatus()) && !"Completed".equals(ticket.getResolutionSlaStatus())) {

                if (now.isAfter(ticket.getResolutionDeadline())) {
                    ticket.setResolutionSlaStatus("Breached");
                    ticket.setPriority("1 - Critical"); // Escalate priority to Critical upon breach
                    isUpdated = true;
                    recordBreach(ticket, "Resolution SLA", ticket.getResolutionDeadline());
                } else {
                    // Check if At Risk (remaining time < 20% of total window)
                    LocalDateTime start = ticket.getCreatedAt() != null ? ticket.getCreatedAt() : now;
                    long totalWindow = Duration.between(start, ticket.getResolutionDeadline()).toMillis();
                    long remaining = Duration.between(now, ticket.getResolutionDeadline()).toMillis();
                    if (totalWindow > 0 && remaining < totalWindow * 0.2) {
                        if (!"At Risk".equals(ticket.getResolutionSlaStatus())) {
                            ticket.setResolutionSlaStatus("At Risk");
                            isUpdated = true;
                        }
                    }
                }
            }

            if (isUpdated) {
                ticketRepository.save(ticket);
            }
        }
    }

    private void recordBreach(Ticket ticket, String slaName, LocalDateTime deadline) {
        try {
            String recordId = ticket.getId().toString();
            Optional<SLABreach> existingBreach = slaBreachRepository.findByRecordIdAndSlaName(recordId, slaName);

            LocalDateTime now = LocalDateTime.now();
            long breachDurationMs = Duration.between(deadline, now).toMillis();
            
            String breachDuration = formatDuration(breachDurationMs);
            String breachTimeslot = getBreachTimeslot(breachDurationMs);
            
            LocalDateTime start = ticket.getCreatedAt();
            long actualTimeMs = Duration.between(start != null ? start : now, now).toMillis();

            SLABreach breach;
            if (existingBreach.isPresent()) {
                breach = existingBreach.get();
                breach.setActualTimeTaken(formatDuration(actualTimeMs));
                breach.setBreachDuration(breachDuration);
                breach.setBreachTimeslot(breachTimeslot);
            } else {
                breach = new SLABreach();
                breach.setRecordId(recordId);
                breach.setRecordType("Ticket");
                breach.setAssignedUser(ticket.getAssignedTo() != null ? ticket.getAssignedTo() : "unassigned");
                breach.setAssignedUserName(ticket.getAssignedToName() != null ? ticket.getAssignedToName() : "Unassigned");
                breach.setSlaName(slaName);
                breach.setSlaTarget(deadline.format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
                breach.setActualTimeTaken(formatDuration(actualTimeMs));
                breach.setBreachDuration(breachDuration);
                breach.setBreachTimeslot(breachTimeslot);
                breach.setBreachTimestamp(deadline.format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
                breach.setStatus("active");
            }
            
            slaBreachRepository.save(breach);
            System.out.println("[SLA Service] Logged SLA breach for ticket: " + ticket.getTicketNumber() + " (" + slaName + ")");
        } catch (Exception e) {
            System.err.println("Error recording SLA breach: " + e.getMessage());
        }
    }

    private String getBreachTimeslot(long durationMs) {
        double hours = (double) durationMs / (1000 * 60 * 60);
        if (hours <= 1) return "0–1 Hour";
        if (hours <= 2) return "1–2 Hours";
        if (hours <= 3) return "2–3 Hours";
        if (hours <= 4) return "3–4 Hours";
        if (hours <= 6) return "4–6 Hours";
        if (hours <= 12) return "6–12 Hours";
        if (hours <= 24) return "12–24 Hours";
        return "24+ Hours";
    }

    private String formatDuration(long durationMs) {
        long seconds = durationMs / 1000;
        long minutes = seconds / 60;
        long hours = minutes / 60;
        long days = hours / 24;

        if (days > 0) {
            return String.format("%dd %dh", days, hours % 24);
        }
        if (hours > 0) {
            return String.format("%dh %dm", hours, minutes % 60);
        }
        if (minutes > 0) {
            return String.format("%dm", minutes);
        }
        return String.format("%ds", seconds);
    }
}
