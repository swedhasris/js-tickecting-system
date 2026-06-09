package com.connectit.core.repository;

import com.connectit.core.model.Approval;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface ApprovalRepository extends JpaRepository<Approval, Long> {
    List<Approval> findByTicketId(Long ticketId);
    List<Approval> findByStatus(String status);
    List<Approval> findByRequestedBy(String requestedBy);
}
