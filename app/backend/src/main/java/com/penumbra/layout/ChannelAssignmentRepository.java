package com.penumbra.layout;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

public interface ChannelAssignmentRepository extends JpaRepository<ChannelAssignment, Long> {

    List<ChannelAssignment> findByControllerKeyOrderByChannelAscPositionAsc(String controllerKey);

    Optional<ChannelAssignment> findByControllerKeyAndChannelAndPosition(
            String controllerKey, int channel, int position);

    @Transactional
    void deleteByControllerKey(String controllerKey);
}
