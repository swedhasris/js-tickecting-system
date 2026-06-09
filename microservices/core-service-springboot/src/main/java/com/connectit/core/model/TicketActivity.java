package com.connectit.core.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@Entity
@Table(name = "ticket_activities")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class TicketActivity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "ticket_id", nullable = false)
    private Long ticketId;

    @Column(name = "activity_type", nullable = false, length = 50)
    private String activityType; // 'work_note', 'comment', 'email', 'status_change', 'system', 'sla_triggered'

    @Column(name = "visibility_type", nullable = false, length = 50)
    private String visibilityType; // 'internal', 'public'

    @Column(name = "created_by", length = 128)
    private String createdBy;

    @Column(name = "created_by_name", length = 255)
    private String createdByName;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String message;

    @Column(name = "metadata_json", columnDefinition = "JSON")
    private String metadataJson;

    @Column(name = "created_at", updatable = false, insertable = false, columnDefinition = "TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
    private LocalDateTime createdAt;
}
