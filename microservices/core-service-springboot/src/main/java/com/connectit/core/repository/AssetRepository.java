package com.connectit.core.repository;

import com.connectit.core.model.Asset;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface AssetRepository extends JpaRepository<Asset, Long> {
    List<Asset> findByOwner(String owner);
    List<Asset> findByStatus(String status);
}
