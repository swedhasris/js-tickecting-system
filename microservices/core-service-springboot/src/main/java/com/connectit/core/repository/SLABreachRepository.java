package com.connectit.core.repository;

import com.connectit.core.model.SLABreach;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface SLABreachRepository extends JpaRepository<SLABreach, Long> {
    Optional<SLABreach> findByRecordIdAndSlaName(String recordId, String slaName);
    List<SLABreach> findByAssignedUser(String assignedUser);
}
