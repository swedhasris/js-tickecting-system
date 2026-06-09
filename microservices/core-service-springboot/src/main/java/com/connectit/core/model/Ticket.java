package com.connectit.core.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@Entity
@Table(name = "tickets")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Ticket {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "ticket_number", unique = true, nullable = false, length = 50)
    private String ticketNumber;

    @Column(nullable = false, length = 255)
    private String caller;

    @Column(name = "caller_user_id", length = 128)
    private String callerUserId;

    @Column(name = "affected_user", length = 255)
    private String affectedUser;

    @Column(name = "affected_user_id", length = 128)
    private String affectedUserId;

    @Column(length = 100)
    private String category;

    @Column(name = "incident_category", length = 100)
    private String incidentCategory;

    @Column(length = 100)
    private String subcategory;

    @Column(length = 100)
    private String service;

    @Column(name = "service_offering", length = 100)
    private String serviceOffering;

    @Column(name = "cmdb_item", length = 100)
    private String cmdbItem;

    @Column(nullable = false, length = 500)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(length = 50)
    private String channel = "Self-service";

    @Column(length = 50)
    private String status = "New";

    @Column(length = 50)
    private String impact = "3 - Low";

    @Column(length = 50)
    private String urgency = "3 - Low";

    @Column(length = 50)
    private String priority = "4 - Low";

    @Column(name = "assignment_group", length = 100)
    private String assignmentGroup;

    @Column(name = "assigned_to", length = 128)
    private String assignedTo;

    @Column(name = "assigned_to_name", length = 255)
    private String assignedToName;

    @Column(name = "created_by", nullable = false, length = 128)
    private String createdBy;

    @Column(name = "created_by_name", length = 255)
    private String createdByName;

    @Column(name = "created_at", updatable = false, insertable = false, columnDefinition = "TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
    private LocalDateTime createdAt;

    @Column(name = "updated_at", insertable = false, columnDefinition = "TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP")
    private LocalDateTime updatedAt;

    @Column(name = "first_response_at")
    private LocalDateTime firstResponseAt;

    @Column(name = "resolved_at")
    private LocalDateTime resolvedAt;

    @Column(name = "closed_at")
    private LocalDateTime closedAt;

    @Column(name = "response_deadline")
    private LocalDateTime responseDeadline;

    @Column(name = "resolution_deadline")
    private LocalDateTime resolutionDeadline;

    @Column(name = "on_hold_start")
    private LocalDateTime onHoldStart;

    @Column(name = "on_hold_reason", length = 255)
    private String onHoldReason;

    @Column(name = "total_paused_time_ms")
    private Long totalPausedTimeMs = 0L;

    @Column(name = "response_sla_status", length = 50)
    private String responseSlaStatus = "In Progress";

    @Column(name = "resolution_sla_status", length = 50)
    private String resolutionSlaStatus = "In Progress";

    private Integer points = 0;

    @Column(name = "approval_status", length = 50)
    private String approvalStatus = "Not Required";

    @Column(name = "parent_ticket_id")
    private Long parentTicketId;
}
