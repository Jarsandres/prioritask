# Changelog

All notable backend changes are documented in this file.

## [1.1.0-rc] - 2026-08-04

### Added
- **BE-010** (`tests/`): Expanded automated test coverage for authentication, tasks, history, and persistence.

### Changed
- **BE-001** (`app/main.py`): Adjusted global API configuration to improve startup stability and endpoint exposure consistency.
- **BE-005** (`app/schemas/`): Reviewed request/response schemas and validations to enforce clearer API contracts.
- **BE-006** (`app/routes/tasks.py`): Refined task endpoints to improve filtering, pagination, and edge-case handling.
- **BE-007** (`app/services/ai.py`): Improved AI flow handling for empty or invalid inputs.
- **BE-008** (`app/config.py`): Centralized environment and sensitive configuration handling.
- **BE-009** (`app/routes/history.py`): Improved history filtering and response consistency.
- **BE-011** (`README.md`): Updated backend documentation for clearer onboarding and deployment guidance.
- **BE-012** (`pyproject.toml`): Reviewed dependencies and packaging configuration for a cleaner, reproducible setup.

### Fixed
- **BE-002** (`app/routes/auth.py`): Corrected authentication error handling and HTTP responses.
- **BE-003** (`app/services/security.py`): Strengthened authentication/authorization logic and credential handling.
- **BE-004** (`app/models/task.py`): Corrected uniqueness and consistency constraints in task data.

## QA Audit Notes

### Severity Summary
- **Critical & High**: BE-001, BE-002, BE-003, BE-004
- **Medium**: BE-005, BE-006, BE-007, BE-008, BE-009
- **Low / Maintenance**: BE-010, BE-011, BE-012
