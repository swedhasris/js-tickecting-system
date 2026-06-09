package com.connectit.core.service;

import com.connectit.core.model.Ticket;
import com.connectit.core.model.TicketActivity;
import com.connectit.core.model.TicketCustomField;
import com.connectit.core.repository.TicketActivityRepository;
import com.connectit.core.repository.TicketCustomFieldRepository;
import com.connectit.core.repository.TicketRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.*;

@Service
public class TicketService {

    @Autowired
    private TicketRepository ticketRepository;

    @Autowired
    private TicketActivityRepository ticketActivityRepository;

    @Autowired
    private TicketCustomFieldRepository ticketCustomFieldRepository;

    private static final Map<String, Integer> PRIORITY_RESPONSE_HOURS = new HashMap<>();
    private static final Map<String, Integer> PRIORITY_RESOLUTION_HOURS = new HashMap<>();

    static {
        PRIORITY_RESPONSE_HOURS.put("1 - Critical", 1);
        PRIORITY_RESPONSE_HOURS.put("2 - High", 4);
        PRIORITY_RESPONSE_HOURS.put("3 - Moderate", 8);
        PRIORITY_RESPONSE_HOURS.put("4 - Low", 24);

        PRIORITY_RESOLUTION_HOURS.put("1 - Critical", 4);
        PRIORITY_RESOLUTION_HOURS.put("2 - High", 8);
        PRIORITY_RESOLUTION_HOURS.put("3 - Moderate", 24);
        PRIORITY_RESOLUTION_HOURS.put("4 - Low", 72);
    }

    public String generateTicketNumber() {
        return "INC" + (int) (1000000 + Math.random() * 9000000);
    }

    public String resolveAssignmentGroup(String category) {
        if (category == null) return "Service Desk";
        switch (category) {
            case "Network": return "Network Team";
            case "Hardware": return "Hardware Support";
            case "Software": return "App Support";
            case "Database": return "DBA Team";
            default: return "Service Desk";
        }
    }

    @Transactional
    public Ticket createTicket(Map<String, Object> body, String currentUserId, String currentUserName, boolean hasAdminAccess) {
        Ticket ticket = new Ticket();
        ticket.setTicketNumber(generateTicketNumber());
        
        String caller = (String) body.getOrDefault("caller", "System");
        ticket.setCaller(caller);
        ticket.setCallerUserId((String) body.get("callerUserId"));
        ticket.setAffectedUser((String) body.get("affectedUser"));
        ticket.setAffectedUserId((String) body.get("affectedUserId"));
        
        String category = (String) body.getOrDefault("category", "Inquiry / Help");
        ticket.setCategory(category);
        
        if (hasAdminAccess) {
            ticket.setIncidentCategory((String) body.get("incidentCategory"));
        }
        
        ticket.setSubcategory((String) body.get("subcategory"));
        ticket.setService((String) body.get("service"));
        ticket.setServiceOffering((String) body.get("serviceOffering"));
        ticket.setCmdbItem((String) body.get("cmdbItem"));
        
        ticket.setTitle((String) body.getOrDefault("title", "Untitled Ticket"));
        ticket.setDescription((String) body.get("description"));
        
        String priority = (String) body.getOrDefault("priority", "4 - Low");
        ticket.setPriority(priority);
        ticket.setImpact((String) body.getOrDefault("impact", "3 - Low"));
        ticket.setUrgency((String) body.getOrDefault("urgency", "3 - Low"));
        ticket.setChannel((String) body.getOrDefault("channel", "Self-service"));
        
        String group = (String) body.get("assignmentGroup");
        ticket.setAssignmentGroup(group != null ? group : resolveAssignmentGroup(category));
        ticket.setAssignedTo((String) body.get("assignedTo"));
        ticket.setAssignedToName((String) body.get("assignedToName"));
        
        ticket.setCreatedBy(currentUserId != null ? currentUserId : caller);
        ticket.setCreatedByName(currentUserName != null ? currentUserName : caller);
        
        LocalDateTime now = LocalDateTime.now();
        int respHours = PRIORITY_RESPONSE_HOURS.getOrDefault(priority, 24);
        int resHours = PRIORITY_RESOLUTION_HOURS.getOrDefault(priority, 72);
        
        ticket.setResponseDeadline(now.plusHours(respHours));
        ticket.setResolutionDeadline(now.plusHours(resHours));
        ticket.setStatus("New");
        ticket.setApprovalStatus("Not Required");
        ticket.setPoints(0);

        Ticket savedTicket = ticketRepository.save(ticket);

        // Save Custom Fields
        if (body.get("customFields") instanceof Map) {
            Map<String, String> customFields = (Map<String, String>) body.get("customFields");
            for (Map.Entry<String, String> entry : customFields.entrySet()) {
                if (entry.getValue() != null && !entry.getValue().trim().isEmpty()) {
                    TicketCustomField cf = new TicketCustomField();
                    cf.setTicketId(savedTicket.getId().toString());
                    cf.setCategoryId(Integer.parseInt(entry.getKey()));
                    cf.setCategoryName("Field_" + entry.getKey());
                    cf.setValueText(entry.getValue());
                    ticketCustomFieldRepository.save(cf);
                }
            }
        }

        // Timeline Audit Logging
        TicketActivity act = new TicketActivity();
        act.setTicketId(savedTicket.getId());
        act.setActivityType("system");
        act.setVisibilityType("public");
        act.setCreatedBy(savedTicket.getCreatedBy());
        act.setCreatedByName(savedTicket.getCreatedByName());
        act.setMessage("Ticket created");
        ticketActivityRepository.save(act);

        if ("1 - Critical".equals(priority) || "2 - High".equals(priority)) {
            TicketActivity highAlertAct = new TicketActivity();
            highAlertAct.setTicketId(savedTicket.getId());
            highAlertAct.setActivityType("system");
            highAlertAct.setVisibilityType("internal");
            highAlertAct.setCreatedBy("System Automation");
            highAlertAct.setCreatedByName("System Automation");
            highAlertAct.setMessage("Manager Notified (High Priority)");
            ticketActivityRepository.save(highAlertAct);
        }

        return savedTicket;
    }

    @Transactional
    public Map<String, Object> updateTicket(Long id, Map<String, Object> body, String updaterId, String updaterName, boolean hasAdminAccess) {
        Ticket ticket = ticketRepository.findById(id).orElseThrow(() -> new NoSuchElementException("Ticket not found"));
        String oldStatus = ticket.getStatus();
        String newStatus = (String) body.get("status");

        // Validate SLA Breach RCA if resolving/closing
        if (("Resolved".equals(newStatus) || "Closed".equals(newStatus)) && !Objects.equals(oldStatus, newStatus)) {
            boolean isBreached = "Breached".equals(ticket.getResolutionSlaStatus());
            if (ticket.getResolutionDeadline() != null && LocalDateTime.now().isAfter(ticket.getResolutionDeadline()) && ticket.getResolvedAt() == null) {
                isBreached = true;
            }

            if (isBreached) {
                Map<String, Object> rcaMeta = (Map<String, Object>) body.get("slaDelayMeta");
                if (rcaMeta == null || rcaMeta.get("rootCauseAnalysis") == null || rcaMeta.get("rootCauseAnalysis").toString().trim().isEmpty()) {
                    throw new IllegalArgumentException("SLA Breach RCA is mandatory before resolving or closing a breached ticket.");
                }
            }
        }

        // Calculate performance points if resolved
        int pointsAwarded = 0;
        if (("Resolved".equals(newStatus) || "Closed".equals(newStatus)) && ticket.getResolvedAt() == null) {
            if (ticket.getResolutionDeadline() != null) {
                LocalDateTime now = LocalDateTime.now();
                if (now.isBefore(ticket.getResolutionDeadline())) {
                    long totalSla = Duration.between(ticket.getCreatedAt(), ticket.getResolutionDeadline()).toMillis();
                    long timeSaved = Duration.between(now, ticket.getResolutionDeadline()).toMillis();
                    pointsAwarded = (int) Math.max(10, Math.round(((double) timeSaved / totalSla) * 100));
                } else {
                    pointsAwarded = 5;
                }
            }
            ticket.setResolvedAt(LocalDateTime.now());
        }

        // Apply updates
        if (body.containsKey("title")) ticket.setTitle((String) body.get("title"));
        if (body.containsKey("description")) ticket.setDescription((String) body.get("description"));
        if (body.containsKey("category")) ticket.setCategory((String) body.get("category"));
        if (body.containsKey("subcategory")) ticket.setSubcategory((String) body.get("subcategory"));
        if (body.containsKey("status")) ticket.setStatus(newStatus);
        if (body.containsKey("priority")) ticket.setPriority((String) body.get("priority"));
        if (body.containsKey("impact")) ticket.setImpact((String) body.get("impact"));
        if (body.containsKey("urgency")) ticket.setUrgency((String) body.get("urgency"));
        if (body.containsKey("assignmentGroup")) ticket.setAssignmentGroup((String) body.get("assignmentGroup"));
        if (body.containsKey("assignedTo")) {
            ticket.setAssignedTo((String) body.get("assignedTo"));
            ticket.setAssignedToName((String) body.get("assignedToName"));
        }
        if (body.containsKey("approvalStatus")) ticket.setApprovalStatus((String) body.get("approvalStatus"));
        
        ticket.setPoints(ticket.getPoints() + pointsAwarded);

        Ticket updatedTicket = ticketRepository.save(ticket);

        // Save Custom Fields
        if (body.containsKey("customFields") && body.get("customFields") instanceof Map) {
            ticketCustomFieldRepository.deleteByTicketId(id.toString());
            Map<String, String> customFields = (Map<String, String>) body.get("customFields");
            for (Map.Entry<String, String> entry : customFields.entrySet()) {
                if (entry.getValue() != null && !entry.getValue().trim().isEmpty()) {
                    TicketCustomField cf = new TicketCustomField();
                    cf.setTicketId(id.toString());
                    cf.setCategoryId(Integer.parseInt(entry.getKey()));
                    cf.setCategoryName("Field_" + entry.getKey());
                    cf.setValueText(entry.getValue());
                    ticketCustomFieldRepository.save(cf);
                }
            }
        }

        // Timeline Audit Logging
        String actionMsg = "Ticket updated";
        if (newStatus != null && !newStatus.equals(oldStatus)) {
            actionMsg = "Status changed to " + newStatus;
        } else if (body.containsKey("assignedTo")) {
            actionMsg = "Assigned technician updated";
        }

        TicketActivity act = new TicketActivity();
        act.setTicketId(id);
        act.setActivityType("status_change");
        act.setVisibilityType("public");
        act.setCreatedBy(updaterId != null ? updaterId : "System");
        act.setCreatedByName(updaterName != null ? updaterName : "System");
        act.setMessage(actionMsg);
        ticketActivityRepository.save(act);

        Map<String, Object> result = new HashMap<>();
        result.put("ticket", updatedTicket);
        result.put("pointsAwarded", pointsAwarded);
        return result;
    }
}
