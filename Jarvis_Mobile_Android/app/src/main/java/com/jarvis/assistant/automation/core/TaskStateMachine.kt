package com.jarvis.assistant.automation.core

enum class TaskState {
    IDLE,
    OPENING_APP,
    OBSERVING,
    RESOLVING_TARGET,
    VALIDATING_TARGET,
    EXECUTING_ACTION,
    WAITING_FOR_UI,
    VERIFYING,
    NEXT_STEP,
    RETRY,
    REOBSERVE,
    WAITING_FOR_CONFIRMATION,
    WAITING_FOR_USER,
    COMPLETED,
    FAILED,
    CANCELLED;

    val isTerminal: Boolean
        get() = this == COMPLETED || this == FAILED || this == CANCELLED
}

/**
 * Enforces explicit state transitions for automated UI workflows.
 */
class TaskStateMachine(initialState: TaskState = TaskState.IDLE) {

    var currentState: TaskState = initialState
        private set

    private val history = mutableListOf<TaskState>()

    init {
        history.add(initialState)
    }

    private val legalTransitions: Map<TaskState, Set<TaskState>> = mapOf(
        TaskState.IDLE to setOf(
            TaskState.OPENING_APP,
            TaskState.OBSERVING,
            TaskState.FAILED,
            TaskState.CANCELLED
        ),
        TaskState.OPENING_APP to setOf(
            TaskState.OBSERVING,
            TaskState.WAITING_FOR_UI,
            TaskState.FAILED,
            TaskState.CANCELLED
        ),
        TaskState.OBSERVING to setOf(
            TaskState.RESOLVING_TARGET,
            TaskState.WAITING_FOR_USER,
            TaskState.COMPLETED,
            TaskState.FAILED,
            TaskState.CANCELLED
        ),
        TaskState.RESOLVING_TARGET to setOf(
            TaskState.VALIDATING_TARGET,
            TaskState.RETRY,
            TaskState.WAITING_FOR_USER,
            TaskState.FAILED,
            TaskState.CANCELLED
        ),
        TaskState.VALIDATING_TARGET to setOf(
            TaskState.EXECUTING_ACTION,
            TaskState.WAITING_FOR_CONFIRMATION,
            TaskState.RETRY,
            TaskState.FAILED,
            TaskState.CANCELLED
        ),
        TaskState.WAITING_FOR_CONFIRMATION to setOf(
            TaskState.EXECUTING_ACTION,
            TaskState.CANCELLED,
            TaskState.FAILED
        ),
        TaskState.EXECUTING_ACTION to setOf(
            TaskState.WAITING_FOR_UI,
            TaskState.VERIFYING,
            TaskState.RETRY,
            TaskState.FAILED,
            TaskState.CANCELLED
        ),
        TaskState.WAITING_FOR_UI to setOf(
            TaskState.VERIFYING,
            TaskState.OBSERVING,
            TaskState.REOBSERVE,
            TaskState.FAILED,
            TaskState.CANCELLED
        ),
        TaskState.VERIFYING to setOf(
            TaskState.NEXT_STEP,
            TaskState.COMPLETED,
            TaskState.RETRY,
            TaskState.FAILED,
            TaskState.CANCELLED
        ),
        TaskState.NEXT_STEP to setOf(
            TaskState.OBSERVING,
            TaskState.RESOLVING_TARGET,
            TaskState.COMPLETED,
            TaskState.FAILED,
            TaskState.CANCELLED
        ),
        TaskState.RETRY to setOf(
            // RETRY must go through REOBSERVE
            TaskState.REOBSERVE,
            TaskState.FAILED,
            TaskState.CANCELLED
        ),
        TaskState.REOBSERVE to setOf(
            TaskState.OBSERVING,
            TaskState.RESOLVING_TARGET,
            TaskState.FAILED,
            TaskState.CANCELLED
        ),
        TaskState.WAITING_FOR_USER to setOf(
            TaskState.OBSERVING,
            TaskState.REOBSERVE,
            TaskState.CANCELLED,
            TaskState.FAILED
        ),
        TaskState.COMPLETED to emptySet(),
        TaskState.FAILED to emptySet(),
        TaskState.CANCELLED to emptySet()
    )

    fun transitionTo(newState: TaskState) {
        if (currentState.isTerminal) {
            throw IllegalStateException("Cannot transition from terminal state $currentState to $newState")
        }

        val allowed = legalTransitions[currentState] ?: emptySet()
        if (newState !in allowed) {
            val ex = IllegalStateException("Illegal state transition: $currentState -> $newState")
            currentState = TaskState.FAILED
            history.add(TaskState.FAILED)
            throw ex
        }

        currentState = newState
        history.add(newState)
    }

    fun canTransitionTo(targetState: TaskState): Boolean {
        if (currentState.isTerminal) return false
        val allowed = legalTransitions[currentState] ?: emptySet()
        return targetState in allowed
    }

    fun getHistory(): List<TaskState> = history.toList()
}
