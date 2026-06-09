package com.connectit.core.repository;

import com.connectit.core.model.Ticket;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface TicketRepository extends JpaRepository<Ticket, Long> {
    Optional<Ticket> findByTicketNumber(String ticketNumber);
    
    @Query("SELECT t FROM Ticket t WHERE t.status NOT IN ('Resolved', 'Closed', 'Canceled')")
    List<Ticket> findAllOpenTickets();

    @Query("SELECT t FROM Ticket t WHERE t.status IN ('Resolved', 'Closed')")
    List<Ticket> findAllResolvedAndClosedTickets();

    List<Ticket> findByAssignedTo(String assignedTo);
    
    @Query("SELECT t FROM Ticket t WHERE t.assignedTo IS NULL OR t.assignedTo = '' OR t.assignedTo = 'unassigned'")
    List<Ticket> findUnassignedTickets();

    List<Ticket> findByStatus(String status);
}
