package com.penumbra.profile;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ComponentProfileRepository extends JpaRepository<ComponentProfile, Long> {
    long countByBrand(String brand);
}
