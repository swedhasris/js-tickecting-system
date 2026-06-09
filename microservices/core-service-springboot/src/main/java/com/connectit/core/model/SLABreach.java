package com.connectit.core.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@Entity
@Table(name = "sla_breaches")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class SLABreach {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "record_id", nullable = false, length = 128)
    private String recordId;

    @Column(name = "record_type", nullable = false, length = 50)
    private String recordType = "Ticket";

    @Column(name = "assigned_user", nullable = false, length = 128)
    private String assignedUser;

    @Column(name = "assigned_user_name", length = 255)
    private String assignedUserName;

    @Column(name = "sla_name", nullable = false, length = 255)
    private String slaName;

    @Column(name = "sla_target", length = 100)
    private String slaTarget;

    @Column(name = "actual_time_taken", length = 100)
    private String actualTimeTaken;

    @Column(name = "breach_duration", length = 100)
    private String breachDuration;

    @Column(name = "breach_timeslot", length = 50)
    private String breachTimeslot;

    @Column(name = "breach_timestamp", length = 100)
    private String breachTimestamp;

    @Column(length = 50)
    private String status = "active";

    @Column(name = "created_at", updatable = false, insertable = false, columnDefinition = "TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
    private LocalDateTime createdAt;
}
