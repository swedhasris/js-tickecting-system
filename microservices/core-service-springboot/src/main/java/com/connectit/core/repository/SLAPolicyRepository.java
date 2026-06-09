package com.connectit.core.repository;

import com.connectit.core.model.SLAPolicy;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.Optional;

@Repository
public interface SLAPolicyRepository extends JpaRepository<SLAPolicy, Long> {
    Optional<SLAPolicy> findByPriorityAndCategory(String priority, String category);
    Optional<SLAPolicy> findByPriorityAndCategoryIsNull(String priority);
}
