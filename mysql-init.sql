-- ============================================================
-- ConnectIT / Nexus — Complete MySQL Initialization Script
-- Idempotent: safe to re-run at any time
-- Run this ONCE to set up the entire MySQL database
-- ============================================================

CREATE DATABASE IF NOT EXISTS connectit_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE connectit_db;

-- ============================================================
-- USERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    uid VARCHAR(128) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    name VARCHAR(255) NOT NULL,
    role ENUM('user', 'agent', 'sub_admin', 'admin', 'super_admin', 'ultra_super_admin') DEFAULT 'user',
    phone VARCHAR(50),
    department VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    is_demo BOOLEAN DEFAULT FALSE,
    email_verified BOOLEAN DEFAULT FALSE,
    photo_url TEXT,
    provider VARCHAR(50) DEFAULT 'email',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL,
    INDEX idx_email (email),
    INDEX idx_uid (uid),
    INDEX idx_role (role),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TICKETS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS tickets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_number VARCHAR(50) UNIQUE NOT NULL,
    caller VARCHAR(255) NOT NULL,
    caller_user_id VARCHAR(128),
    affected_user VARCHAR(255),
    affected_user_id VARCHAR(128),
    category VARCHAR(100),
    incident_category VARCHAR(100) NULL,
    subcategory VARCHAR(100),
    service VARCHAR(100),
    service_offering VARCHAR(100),
    cmdb_item VARCHAR(100),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    channel ENUM('Phone', 'Email', 'Self-service', 'Walk-in', 'Other') DEFAULT 'Self-service',
    status ENUM('New', 'In Progress', 'On Hold', 'Resolved', 'Closed', 'Canceled', 'Pending Approval') DEFAULT 'New',
    impact ENUM('1 - High', '2 - Medium', '3 - Low') DEFAULT '3 - Low',
    urgency ENUM('1 - High', '2 - Medium', '3 - Low') DEFAULT '3 - Low',
    priority ENUM('1 - Critical', '2 - High', '3 - Moderate', '4 - Low') DEFAULT '4 - Low',
    assignment_group VARCHAR(100),
    assigned_to VARCHAR(128),
    assigned_to_name VARCHAR(255),
    created_by VARCHAR(128) NOT NULL,
    created_by_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    first_response_at TIMESTAMP NULL,
    resolved_at TIMESTAMP NULL,
    resolved_by VARCHAR(128) NULL,
    resolved_by_name VARCHAR(255) NULL,
    closed_at TIMESTAMP NULL,
    closed_by VARCHAR(128) NULL,
    closed_by_name VARCHAR(255) NULL,
    response_deadline TIMESTAMP NULL,
    resolution_deadline TIMESTAMP NULL,
    on_hold_start TIMESTAMP NULL,
    on_hold_reason VARCHAR(255),
    total_paused_time BIGINT DEFAULT 0,
    total_paused_time_ms BIGINT DEFAULT 0,
    response_sla_status ENUM('In Progress', 'Pending', 'Completed', 'Breached', 'At Risk') DEFAULT 'In Progress',
    resolution_sla_status ENUM('In Progress', 'Pending', 'Completed', 'Breached', 'At Risk') DEFAULT 'In Progress',
    response_sla_start_time TIMESTAMP NULL,
    resolution_sla_start_time TIMESTAMP NULL,
    points INT DEFAULT 0,
    approval_status ENUM('Not Required', 'Pending', 'Approved', 'Rejected') DEFAULT 'Not Required',
    parent_ticket_id INT NULL,
    sla_delay_meta_json JSON NULL,
    sla_delay_logs_json JSON NULL,
    FOREIGN KEY (parent_ticket_id) REFERENCES tickets(id) ON DELETE SET NULL,
    INDEX idx_ticket_number (ticket_number),
    INDEX idx_status (status),
    INDEX idx_priority (priority),
    INDEX idx_assigned_to (assigned_to),
    INDEX idx_created_by (created_by),
    INDEX idx_caller (caller),
    INDEX idx_category (category),
    INDEX idx_created_at (created_at),
    INDEX idx_resolved_at (resolved_at),
    INDEX idx_status_priority (status, priority),
    INDEX idx_assigned_status (assigned_to, status),
    FULLTEXT INDEX idx_title_description (title, description)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TICKET HISTORY TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS ticket_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id INT NOT NULL,
    action VARCHAR(255) NOT NULL,
    user VARCHAR(255),
    user_id VARCHAR(128),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    details TEXT,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    INDEX idx_ticket_id (ticket_id),
    INDEX idx_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- COMMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id INT NOT NULL,
    user_id VARCHAR(128),
    user_name VARCHAR(255),
    user_role VARCHAR(50),
    message TEXT NOT NULL,
    is_internal BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    INDEX idx_ticket_id (ticket_id),
    INDEX idx_user_id (user_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TICKET ACTIVITIES TABLE (Unified Timeline)
-- ============================================================
CREATE TABLE IF NOT EXISTS ticket_activities (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id VARCHAR(128) NOT NULL,  -- VARCHAR to support both INT IDs and Firebase IDs
    activity_type VARCHAR(50) NOT NULL,
    visibility_type VARCHAR(50) NOT NULL,
    created_by VARCHAR(128),
    created_by_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    message TEXT NOT NULL,
    metadata_json JSON,
    INDEX idx_ticket_id (ticket_id),
    INDEX idx_created_at (created_at),
    INDEX idx_visibility (visibility_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- APPROVALS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS approvals (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id INT NOT NULL,
    status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending',
    requested_by VARCHAR(128) NOT NULL,
    requested_by_name VARCHAR(255),
    approved_by VARCHAR(128),
    approved_by_name VARCHAR(255),
    comments TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    approved_at TIMESTAMP NULL,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    INDEX idx_ticket_id (ticket_id),
    INDEX idx_status (status),
    INDEX idx_requested_by (requested_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SLA POLICIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS sla_policies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    priority VARCHAR(50) NOT NULL,
    category VARCHAR(100),
    response_time_hours INT NOT NULL DEFAULT 8,
    resolution_time_hours INT NOT NULL DEFAULT 24,
    business_hours_only BOOLEAN DEFAULT FALSE,
    exclude_weekends BOOLEAN DEFAULT FALSE,
    exclude_holidays BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_priority (priority),
    INDEX idx_category (category),
    INDEX idx_active (is_active),
    UNIQUE KEY unique_priority_category (priority, category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- SLA CONFIGURATIONS (alias table for compatibility)
CREATE TABLE IF NOT EXISTS sla_configurations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    priority VARCHAR(50) NOT NULL,
    department VARCHAR(100),
    response_time_hours INT,
    resolution_time_hours INT,
    business_hours_only BOOLEAN DEFAULT FALSE,
    exclude_weekends BOOLEAN DEFAULT FALSE,
    exclude_holidays BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SLA BREACHES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS sla_breaches (
    id INT AUTO_INCREMENT PRIMARY KEY,
    record_id VARCHAR(128) NOT NULL,  -- Supports Firebase doc IDs and INT IDs
    record_type VARCHAR(50) NOT NULL DEFAULT 'Ticket',
    assigned_user VARCHAR(128) NOT NULL,
    assigned_user_name VARCHAR(255),
    sla_name VARCHAR(100) NOT NULL,
    sla_target VARCHAR(50),
    actual_time_taken VARCHAR(50),
    breach_duration VARCHAR(50),
    breach_timeslot VARCHAR(50),
    breach_timestamp VARCHAR(50),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_record_id (record_id),
    INDEX idx_assigned_user (assigned_user),
    INDEX idx_status (status),
    INDEX idx_sla_name (sla_name),
    UNIQUE KEY unique_record_sla (record_id, sla_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SLA AUDIT LOGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS sla_audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id VARCHAR(128) NOT NULL,
    sla_type VARCHAR(50) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reason TEXT,
    INDEX idx_ticket_id (ticket_id),
    INDEX idx_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- ASSETS / CMDB TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS assets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type ENUM('Server', 'Database', 'Network', 'Application', 'Hardware', 'Service') DEFAULT 'Hardware',
    status ENUM('Operational', 'Degraded', 'Maintenance', 'Retired') DEFAULT 'Operational',
    owner VARCHAR(128),
    owner_name VARCHAR(255),
    location VARCHAR(255),
    serial_number VARCHAR(255),
    model VARCHAR(255),
    manufacturer VARCHAR(255),
    purchase_date DATE,
    warranty_expiry DATE,
    ip_address VARCHAR(50),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_name (name),
    INDEX idx_type (type),
    INDEX idx_status (status),
    INDEX idx_owner (owner)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- PROBLEMS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS problems (
    id INT AUTO_INCREMENT PRIMARY KEY,
    problem_number VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    status ENUM('Open', 'Under Investigation', 'Resolved', 'Closed') DEFAULT 'Open',
    priority ENUM('1 - Critical', '2 - High', '3 - Moderate', '4 - Low') DEFAULT '4 - Low',
    category VARCHAR(100),
    root_cause TEXT,
    workaround TEXT,
    resolution TEXT,
    assigned_to VARCHAR(128),
    assigned_to_name VARCHAR(255),
    reported_by VARCHAR(128),
    reported_by_name VARCHAR(255),
    related_incidents INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP NULL,
    closed_at TIMESTAMP NULL,
    INDEX idx_problem_number (problem_number),
    INDEX idx_status (status),
    INDEX idx_priority (priority),
    INDEX idx_assigned_to (assigned_to)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- CHANGES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS `changes` (
    id INT AUTO_INCREMENT PRIMARY KEY,
    change_number VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    type ENUM('Normal', 'Standard', 'Emergency') DEFAULT 'Normal',
    state ENUM('Draft', 'Submitted', 'Planned', 'Approved', 'In Progress', 'Completed', 'Closed', 'Canceled') DEFAULT 'Draft',
    risk ENUM('Low', 'Medium', 'High', 'Critical') DEFAULT 'Low',
    impact TEXT,
    rollback_plan TEXT,
    requester VARCHAR(128) NOT NULL,
    requester_name VARCHAR(255),
    assigned_to VARCHAR(128),
    assigned_to_name VARCHAR(255),
    planned_start_date TIMESTAMP NULL,
    planned_end_date TIMESTAMP NULL,
    actual_start_date TIMESTAMP NULL,
    actual_end_date TIMESTAMP NULL,
    category VARCHAR(100),
    affected_services TEXT,
    approval_status ENUM('Not Required', 'Pending', 'Approved', 'Rejected') DEFAULT 'Not Required',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_change_number (change_number),
    INDEX idx_type (type),
    INDEX idx_state (state),
    INDEX idx_risk (risk),
    INDEX idx_requester (requester),
    INDEX idx_planned_dates (planned_start_date, planned_end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- KNOWLEDGE BASE ARTICLES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS knowledge_articles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    article_number VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(500) NOT NULL,
    category VARCHAR(100),
    subcategory VARCHAR(100),
    content TEXT NOT NULL,
    summary TEXT,
    tags TEXT,
    views INT DEFAULT 0,
    rating DECIMAL(2,1) DEFAULT 0,
    rating_count INT DEFAULT 0,
    helpful_count INT DEFAULT 0,
    not_helpful_count INT DEFAULT 0,
    author VARCHAR(128) NOT NULL,
    author_name VARCHAR(255),
    reviewer VARCHAR(128),
    reviewer_name VARCHAR(255),
    status ENUM('Draft', 'Published', 'Archived') DEFAULT 'Draft',
    visibility ENUM('Internal', 'Public') DEFAULT 'Internal',
    version INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    published_at TIMESTAMP NULL,
    archived_at TIMESTAMP NULL,
    votes INT DEFAULT 0,
    INDEX idx_article_number (article_number),
    INDEX idx_category (category),
    INDEX idx_status (status),
    INDEX idx_author (author),
    INDEX idx_views (views),
    FULLTEXT INDEX idx_title_content (title, content)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- NOTIFICATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(128) NOT NULL,
    type VARCHAR(50) DEFAULT 'system',
    title VARCHAR(255),
    message TEXT,
    ticket_id VARCHAR(128),
    ticket_number VARCHAR(50),
    actor_id VARCHAR(128),
    actor_name VARCHAR(255),
    related_ticket_id INT NULL,
    related_entity_type VARCHAR(50),
    related_entity_id VARCHAR(50),
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_user_read (user_id, is_read),
    INDEX idx_created_at (created_at),
    INDEX idx_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- USER SESSIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS user_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(128) NOT NULL,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    ip_address VARCHAR(50),
    user_agent TEXT,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_session_token (session_token),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- AUDIT LOG TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    user_id VARCHAR(128),
    user_name VARCHAR(255),
    old_values JSON,
    new_values JSON,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_entity (entity_type, entity_id),
    INDEX idx_user_id (user_id),
    INDEX idx_action (action),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SYSTEM SETTINGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS system_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    setting_type ENUM('string', 'number', 'boolean', 'json') DEFAULT 'string',
    description TEXT,
    updated_by VARCHAR(128),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_setting_key (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TIMESHEETS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS timesheets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(128) NOT NULL,
    week_start DATE NOT NULL,
    week_end DATE NOT NULL,
    status ENUM('Draft', 'Submitted', 'Approved', 'Rejected') DEFAULT 'Draft',
    total_hours DECIMAL(10, 4) DEFAULT 0.0000,
    screenshot_url TEXT,
    approved_by VARCHAR(128),
    approved_at TIMESTAMP NULL,
    rejection_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    submitted_at TIMESTAMP NULL,
    INDEX idx_user_week (user_id, week_start),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TIME CARDS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS time_cards (
    id INT AUTO_INCREMENT PRIMARY KEY,
    timesheet_id INT NOT NULL,
    user_id VARCHAR(128) NOT NULL,
    entry_date DATE NOT NULL,
    task VARCHAR(255),
    hours_worked DECIMAL(10, 6) DEFAULT 0.000000,
    description TEXT,
    short_description VARCHAR(255),
    start_time VARCHAR(20),
    end_time VARCHAR(20),
    deduct DECIMAL(10, 2) DEFAULT 0.00,
    work_type VARCHAR(50),
    billable VARCHAR(50),
    notes TEXT,
    status ENUM('Draft', 'Submitted', 'Approved', 'Rejected') DEFAULT 'Draft',
    elapsed_seconds INT DEFAULT 0,
    ticket_id VARCHAR(128),
    ticket_number VARCHAR(50),
    is_system_generated BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (timesheet_id) REFERENCES timesheets(id) ON DELETE CASCADE,
    INDEX idx_timesheet_id (timesheet_id),
    INDEX idx_user_date (user_id, entry_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- ACTIVITY SESSIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS activity_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(100) NOT NULL,
    user_id VARCHAR(128) NOT NULL,
    user_name VARCHAR(255),
    start_time DATETIME,
    stop_time DATETIME,
    duration INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',
    ticket_number VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session_id (session_id),
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- ACTIVITY ENTRIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS activity_entries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(100),
    user_id VARCHAR(128) NOT NULL,
    screenshot_url TEXT,
    screenshot_filename VARCHAR(255),
    screenshot_format VARCHAR(20),
    screenshot_size_kb INT,
    activity_label TEXT,
    description TEXT,
    confidence DECIMAL(5,4),
    captured_at DATETIME,
    keystrokes INT DEFAULT 0,
    clicks INT DEFAULT 0,
    ticket_number VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session_id (session_id),
    INDEX idx_user_id (user_id),
    INDEX idx_captured_at (captured_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- INCIDENT CATEGORIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS incident_categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    status ENUM('Active', 'Inactive') DEFAULT 'Active',
    created_by VARCHAR(255),
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_updated_by VARCHAR(255),
    last_updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_name (name),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- INCIDENT CATEGORY OPTIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS incident_category_options (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category_id INT NOT NULL,
    value_text VARCHAR(255) NOT NULL,
    status ENUM('Active', 'Inactive') DEFAULT 'Active',
    created_by VARCHAR(255),
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_updated_by VARCHAR(255),
    last_updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES incident_categories(id) ON DELETE CASCADE,
    INDEX idx_category_id (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TICKET CUSTOM FIELDS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS ticket_custom_fields (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id VARCHAR(128) NOT NULL,
    category_id INT NOT NULL,
    category_name VARCHAR(100) NOT NULL,
    value_text TEXT NOT NULL,
    INDEX idx_ticket_id (ticket_id),
    INDEX idx_category_id (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- EMAIL QUEUE TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS email_queue (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id INT,
    company_id INT,
    email_integration_id INT,
    direction ENUM('outbound', 'inbound') DEFAULT 'outbound',
    recipient VARCHAR(255),
    subject VARCHAR(255),
    body MEDIUMTEXT,
    status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
    attempts INT DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP NULL,
    INDEX idx_status (status),
    INDEX idx_ticket (ticket_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TICKET EMAIL ACTIVITIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS ticket_email_activities (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id INT NOT NULL,
    direction ENUM('inbound', 'outbound'),
    sender VARCHAR(255),
    recipient VARCHAR(255),
    subject VARCHAR(255),
    body MEDIUMTEXT,
    status ENUM('success', 'failed', 'pending'),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ticket_id (ticket_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- EMAIL LOGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS email_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id INT,
    ticket_number VARCHAR(50),
    direction ENUM('inbound', 'outbound') DEFAULT 'outbound',
    recipient VARCHAR(255),
    sender VARCHAR(255),
    subject VARCHAR(255),
    body_preview TEXT,
    message_id VARCHAR(255),
    in_reply_to VARCHAR(255),
    references_header TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    provider_response TEXT,
    error_message TEXT,
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 5,
    next_retry_at TIMESTAMP NULL,
    email_type VARCHAR(50) DEFAULT 'notification',
    config_id INT,
    company_id VARCHAR(128),
    email_integration_id INT,
    mailbox_used VARCHAR(255),
    sent_at TIMESTAMP NULL,
    received_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_message_id (message_id),
    INDEX idx_ticket_id (ticket_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- EMAIL THREADS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS email_threads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id INT NOT NULL,
    ticket_number VARCHAR(50) NOT NULL,
    thread_id VARCHAR(255) UNIQUE NOT NULL,
    original_message_id VARCHAR(255),
    subject VARCHAR(500),
    last_message_id VARCHAR(255),
    message_count INT DEFAULT 1,
    participants TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ticket_id (ticket_id),
    INDEX idx_ticket_number (ticket_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- NOTIFICATIONS QUEUE TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications_queue (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    ticket_id INT,
    ticket_number VARCHAR(50),
    recipient VARCHAR(255) NOT NULL,
    subject VARCHAR(255),
    body_html MEDIUMTEXT,
    status VARCHAR(50) DEFAULT 'pending',
    priority INT DEFAULT 5,
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 5,
    next_retry_at TIMESTAMP NULL,
    error_message TEXT,
    config_id INT,
    metadata_json JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP NULL,
    INDEX idx_status (status),
    INDEX idx_next_retry (next_retry_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- COMPANIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS companies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255),
    contact_name VARCHAR(255),
    phone VARCHAR(50),
    email VARCHAR(255),
    address1 TEXT,
    address2 TEXT,
    city VARCHAR(100),
    province VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100),
    website VARCHAR(255),
    logo_url TEXT,
    type VARCHAR(50),
    status VARCHAR(50),
    email_integration_id INT,
    primary_color VARCHAR(20),
    secondary_color VARCHAR(20),
    support_signature TEXT,
    industry VARCHAR(100),
    priority_tier VARCHAR(50),
    default_assignment_group VARCHAR(100),
    default_sla_policy VARCHAR(100),
    default_support_mailbox VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_name (name),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- COMPANY EMAIL CONFIGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS company_email_configs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_name VARCHAR(255),
    email_address VARCHAR(255),
    smtp_host VARCHAR(255),
    smtp_port INT,
    smtp_user VARCHAR(255),
    smtp_pass TEXT,
    imap_host VARCHAR(255),
    imap_port INT,
    imap_user VARCHAR(255),
    imap_pass TEXT,
    encryption VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email_address),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- COMPANY HISTORY TABLE  (was missing from original mysql-schema.sql)
-- ============================================================
CREATE TABLE IF NOT EXISTS company_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT,
    action VARCHAR(100),
    field_name VARCHAR(100),
    old_value TEXT,
    new_value TEXT,
    user VARCHAR(255),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_company_id (company_id),
    INDEX idx_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SETTINGS GROUPS TABLE (was missing from original mysql-schema.sql)
-- ============================================================
CREATE TABLE IF NOT EXISTS settings_groups (
    id VARCHAR(128) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    manager_uid VARCHAR(128),
    manager_name VARCHAR(255),
    assignment_email VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_name (name),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- MESSAGE HISTORY TABLE (was missing from original mysql-schema.sql)
-- ============================================================
CREATE TABLE IF NOT EXISTS message_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id VARCHAR(128),
    direction VARCHAR(20),
    channel VARCHAR(50),
    sender VARCHAR(255),
    recipient VARCHAR(255),
    subject VARCHAR(500),
    body MEDIUMTEXT,
    status VARCHAR(50),
    metadata_json JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ticket_id (ticket_id),
    INDEX idx_direction (direction),
    INDEX idx_channel (channel),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- WORK NOTES TABLE  (was missing from original mysql-schema.sql)
-- ============================================================
CREATE TABLE IF NOT EXISTS work_notes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id VARCHAR(128) NOT NULL,
    user_id VARCHAR(128),
    user_name VARCHAR(255),
    note TEXT NOT NULL,
    is_internal BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ticket_id (ticket_id),
    INDEX idx_user_id (user_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- WORK SESSIONS TABLE  (was missing from original mysql-schema.sql)
-- ============================================================
CREATE TABLE IF NOT EXISTS work_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id VARCHAR(128),
    user_id VARCHAR(128) NOT NULL,
    user_name VARCHAR(255),
    session_type VARCHAR(50) DEFAULT 'work',
    start_time DATETIME,
    end_time DATETIME,
    duration INT DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ticket_id (ticket_id),
    INDEX idx_user_id (user_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- MEETINGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS meetings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    meeting_id VARCHAR(100) UNIQUE NOT NULL,
    creation_method VARCHAR(50) NOT NULL,
    title VARCHAR(500) NOT NULL,
    meeting_date DATETIME NOT NULL,
    platform VARCHAR(100),
    conducted_by VARCHAR(255),
    attendees TEXT,
    absentees TEXT,
    one_line_summary TEXT,
    short_description TEXT,
    detailed_description TEXT,
    discussion_points TEXT,
    decisions_taken TEXT,
    action_items TEXT,
    responsible_person VARCHAR(255),
    target_date VARCHAR(50),
    next_steps TEXT,
    remarks TEXT,
    file_path TEXT,
    file_name VARCHAR(255),
    file_size INT,
    status VARCHAR(50) DEFAULT 'Draft',
    version INT DEFAULT 1,
    created_by VARCHAR(128),
    created_by_name VARCHAR(255),
    virtual_data_json TEXT,
    attendance_data_json TEXT,
    notifications_json TEXT,
    recording_json TEXT,
    timeline_json TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_meeting_id (meeting_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- MEETING VERSIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS meeting_versions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    meeting_db_id INT NOT NULL,
    meeting_id VARCHAR(100) NOT NULL,
    version INT NOT NULL,
    title VARCHAR(500),
    meeting_date DATETIME,
    status VARCHAR(50),
    file_path TEXT,
    file_name VARCHAR(255),
    template_data TEXT,
    updated_by VARCHAR(128),
    updated_by_name VARCHAR(255),
    change_summary TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (meeting_db_id) REFERENCES meetings(id) ON DELETE CASCADE,
    INDEX idx_meeting_db_id (meeting_db_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- MEETING AUDIT LOGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS meeting_audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    meeting_id VARCHAR(100) NOT NULL,
    action VARCHAR(100) NOT NULL,
    performed_by VARCHAR(128) NOT NULL,
    performed_by_name VARCHAR(255),
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_meeting_id (meeting_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TS MEETINGS TABLE (WebRTC call lobby)
-- ============================================================
CREATE TABLE IF NOT EXISTS ts_meetings (
    tsm_id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    meeting_date VARCHAR(50),
    meeting_time VARCHAR(50),
    duration VARCHAR(50),
    organizer VARCHAR(255),
    participants TEXT,
    meeting_type VARCHAR(50),
    priority VARCHAR(50),
    status VARCHAR(50) DEFAULT 'Draft',
    room_id VARCHAR(50),
    password VARCHAR(50),
    notes TEXT,
    attachments TEXT,
    comments TEXT,
    timeline TEXT,
    recurrence VARCHAR(50),
    ticket_id VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_room_id (room_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TS MEETING CHAT TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS ts_meeting_chat (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tsm_id VARCHAR(50) NOT NULL,
    sender_id VARCHAR(128),
    sender_name VARCHAR(255),
    text TEXT,
    timestamp VARCHAR(100),
    type VARCHAR(20) DEFAULT 'text',
    file_url TEXT,
    file_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tsm_id) REFERENCES ts_meetings(tsm_id) ON DELETE CASCADE,
    INDEX idx_tsm_id (tsm_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TS MEETING ATTENDANCE TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS ts_meeting_attendance (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tsm_id VARCHAR(50) NOT NULL,
    peer_id VARCHAR(50),
    name VARCHAR(255),
    join_time VARCHAR(100),
    leave_time VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tsm_id) REFERENCES ts_meetings(tsm_id) ON DELETE CASCADE,
    INDEX idx_attendance_tsm_id (tsm_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- DEFAULT DATA INSERTS (safe, idempotent)
-- ============================================================

-- Default SLA Policies
INSERT IGNORE INTO sla_policies (name, priority, response_time_hours, resolution_time_hours, description) VALUES
('Critical Priority SLA', '1 - Critical', 1, 4, 'Immediate response required for critical issues'),
('High Priority SLA', '2 - High', 4, 8, 'Urgent response for high priority issues'),
('Moderate Priority SLA', '3 - Moderate', 8, 24, 'Standard response for moderate priority'),
('Low Priority SLA', '4 - Low', 24, 72, 'Best effort response for low priority');

-- Default System Settings
INSERT IGNORE INTO system_settings (setting_key, setting_value, setting_type, description) VALUES
('ticket_number_prefix', 'INC', 'string', 'Prefix for incident ticket numbers'),
('ticket_number_next', '1000000', 'number', 'Next ticket number sequence'),
('enable_sla_monitoring', 'true', 'boolean', 'Enable automatic SLA monitoring'),
('enable_email_notifications', 'false', 'boolean', 'Enable email notifications'),
('company_name', 'Connect IT', 'string', 'Company name displayed in portal'),
('maintenance_mode', 'false', 'boolean', 'Enable maintenance mode');

-- ============================================================
-- PERFORMANCE: Additional composite indexes for dashboard queries
-- ============================================================
-- (Run these separately if they already exist — safe to skip on error)
CREATE INDEX IF NOT EXISTS idx_tickets_status_created ON tickets(status, created_at);
CREATE INDEX IF NOT EXISTS idx_tickets_assignee_status ON tickets(assigned_to, status, created_at);
CREATE INDEX IF NOT EXISTS idx_tickets_priority_status ON tickets(priority, status);
CREATE INDEX IF NOT EXISTS idx_breaches_user_status ON sla_breaches(assigned_user, status);
CREATE INDEX IF NOT EXISTS idx_timesheets_user_status ON timesheets(user_id, status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read, created_at);
