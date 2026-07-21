package com.penumbra.layout;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

public interface ChannelAssignmentRepository extends JpaRepository<ChannelAssignment, Long> {

    List<ChannelAssignment> findByControllerKeyOrderByChannelAscPositionAsc(String controllerKey);

    @Transactional
    void deleteByControllerKey(String controllerKey);
}
