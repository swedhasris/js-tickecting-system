package com.connectit.core.controller;

import com.connectit.core.model.Comment;
import com.connectit.core.model.Ticket;
import com.connectit.core.model.TicketActivity;
import com.connectit.core.repository.CommentRepository;
import com.connectit.core.repository.TicketActivityRepository;
import com.connectit.core.repository.TicketRepository;
import com.connectit.core.service.TicketService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.*;

@RestController
@RequestMapping("/api/tickets")
public class TicketController {

    @Autowired
    private TicketRepository ticketRepository;

    @Autowired
    private TicketService ticketService;

    @Autowired
    private CommentRepository commentRepository;

    @Autowired
    private TicketActivityRepository ticketActivityRepository;

    @GetMapping("/all")
    public ResponseEntity<List<Ticket>> getAllTickets() {
        return ResponseEntity.ok(ticketRepository.findAll());
    }

    @GetMapping("/open")
    public ResponseEntity<List<Ticket>> getOpenTickets() {
        return ResponseEntity.ok(ticketRepository.findAllOpenTickets());
    }

    @GetMapping("/assigned/{userId}")
    public ResponseEntity<List<Ticket>> getAssignedTickets(@PathVariable String userId) {
        return ResponseEntity.ok(ticketRepository.findByAssignedTo(userId));
    }

    @GetMapping("/unassigned")
    public ResponseEntity<List<Ticket>> getUnassignedTickets() {
        return ResponseEntity.ok(ticketRepository.findUnassignedTickets());
    }

    @GetMapping("/resolved")
    public ResponseEntity<List<Ticket>> getResolvedTickets() {
        return ResponseEntity.ok(ticketRepository.findByStatus("Resolved"));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getTicketById(@PathVariable Long id) {
        Optional<Ticket> ticketOpt = ticketRepository.findById(id);
        if (ticketOpt.isEmpty()) {
            Map<String, String> err = new HashMap<>();
            err.put("error", "Ticket not found");
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(err);
        }
        
        Ticket ticket = ticketOpt.get();
        List<Comment> comments = commentRepository.findByTicketIdOrderByCreatedAtAsc(id);
        List<TicketActivity> history = ticketActivityRepository.findByTicketIdOrderByCreatedAtDesc(id);

        Map<String, Object> response = new HashMap<>();
        response.put("id", ticket.getId().toString());
        response.put("ticket_number", ticket.getTicketNumber());
        response.put("caller", ticket.getCaller());
        response.put("caller_user_id", ticket.getCallerUserId());
        response.put("affected_user", ticket.getAffectedUser());
        response.put("affected_user_id", ticket.getAffectedUserId());
        response.put("category", ticket.getCategory());
        response.put("subcategory", ticket.getSubcategory());
        response.put("service", ticket.getService());
        response.put("service_offering", ticket.getServiceOffering());
        response.put("cmdb_item", ticket.getCmdbItem());
        response.put("title", ticket.getTitle());
        response.put("description", ticket.getDescription());
        response.put("channel", ticket.getChannel());
        response.put("status", ticket.getStatus());
        response.put("impact", ticket.getImpact());
        response.put("urgency", ticket.getUrgency());
        response.put("priority", ticket.getPriority());
        response.put("assignment_group", ticket.getAssignmentGroup());
        response.put("assigned_to", ticket.getAssignedTo());
        response.put("assigned_to_name", ticket.getAssignedToName());
        response.put("created_by", ticket.getCreatedBy());
        response.put("created_by_name", ticket.getCreatedByName());
        response.put("created_at", ticket.getCreatedAt());
        response.put("updated_at", ticket.getUpdatedAt());
        response.put("first_response_at", ticket.getFirstResponseAt());
        response.put("resolved_at", ticket.getResolvedAt());
        response.put("closed_at", ticket.getClosedAt());
        response.put("response_deadline", ticket.getResponseDeadline());
        response.put("resolution_deadline", ticket.getResolutionDeadline());
        response.put("points", ticket.getPoints());
        response.put("approval_status", ticket.getApprovalStatus());
        response.put("comments", comments);
        response.put("history", history);

        return ResponseEntity.ok(response);
    }

    @PostMapping(value = {"/create", ""})
    public ResponseEntity<?> createTicket(@RequestBody Map<String, Object> body) {
        String username = SecurityContextHolder.getContext().getAuthentication().getName();
        try {
            Ticket ticket = ticketService.createTicket(body, username, username, true);
            return ResponseEntity.status(HttpStatus.CREATED).body(ticket);
        } catch (Exception e) {
            Map<String, String> err = new HashMap<>();
            err.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(err);
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> updateTicket(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        String username = SecurityContextHolder.getContext().getAuthentication().getName();
        try {
            Map<String, Object> result = ticketService.updateTicket(id, body, username, username, true);
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            Map<String, String> err = new HashMap<>();
            err.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(err);
        } catch (Exception e) {
            Map<String, String> err = new HashMap<>();
            err.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(err);
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteTicket(@PathVariable Long id) {
        if (!ticketRepository.existsById(id)) {
            Map<String, String> err = new HashMap<>();
            err.put("error", "Ticket not found");
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(err);
        }
        ticketRepository.deleteById(id);
        Map<String, String> res = new HashMap<>();
        res.put("message", "Ticket deleted successfully");
        return ResponseEntity.ok(res);
    }

    @GetMapping("/{id}/activities")
    public ResponseEntity<List<TicketActivity>> getTicketActivities(@PathVariable Long id, @RequestParam(required = false) String visibility) {
        if (visibility != null) {
            return ResponseEntity.ok(ticketActivityRepository.findByTicketIdAndVisibilityTypeOrderByCreatedAtDesc(id, visibility));
        }
        return ResponseEntity.ok(ticketActivityRepository.findByTicketIdOrderByCreatedAtDesc(id));
    }

    @PostMapping("/{id}/comments")
    public ResponseEntity<?> addComment(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        String username = SecurityContextHolder.getContext().getAuthentication().getName();
        String message = (String) body.get("message");
        Boolean isInternal = (Boolean) body.getOrDefault("is_internal", false);

        if (message == null || message.trim().isEmpty()) {
            Map<String, String> err = new HashMap<>();
            err.put("error", "Comment message is required");
            return ResponseEntity.badRequest().body(err);
        }

        Comment comment = new Comment();
        comment.setTicketId(id);
        comment.setUserId(username);
        comment.setUserName(username);
        comment.setUserRole("user"); // Simple placeholder
        comment.setMessage(message);
        comment.setIsInternal(isInternal);

        Comment savedComment = commentRepository.save(comment);

        // Timeline log
        TicketActivity act = new TicketActivity();
        act.setTicketId(id);
        act.setActivityType("comment");
        act.setVisibilityType(isInternal ? "internal" : "public");
        act.setCreatedBy(username);
        act.setCreatedByName(username);
        act.setMessage(isInternal ? "Internal note added" : "Comment added");
        ticketActivityRepository.save(act);

        return ResponseEntity.status(HttpStatus.CREATED).body(savedComment);
    }
}
