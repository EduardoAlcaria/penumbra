package com.penumbra.profile;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ControllerProfileRepository extends JpaRepository<ControllerProfile, Long> {
    Optional<ControllerProfile> findByVendorIdAndProductId(int vendorId, int productId);
    boolean existsByVendorIdAndProductId(int vendorId, int productId);
}
