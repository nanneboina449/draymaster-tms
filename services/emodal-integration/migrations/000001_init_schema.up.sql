-- ==============================================================================
-- eModal Integration Service — Initial Schema
-- ==============================================================================
-- Tables:
--   published_containers  Containers registered with eModal for status tracking
--   gate_fees             Terminal fees (demurrage, storage, gate fees, etc.)
-- ==============================================================================

-- ---------------------------------------------------------------------------
-- published_containers
-- ---------------------------------------------------------------------------
-- Tracks which containers have been published to eModal for real-time tracking.
-- A row is created when we POST to the eModal EDS PublishContainers endpoint.
-- current_status is updated each time a status event arrives via Service Bus.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS published_containers (
    container_number VARCHAR(11) NOT NULL PRIMARY KEY,
    terminal_code    VARCHAR(20) NOT NULL,
    port_code        VARCHAR(10),
    published_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_status_at   TIMESTAMPTZ,
    current_status   VARCHAR(30) CHECK (current_status IN (
        'MANIFESTED', 'DISCHARGED', 'IN_YARD', 'AVAILABLE',
        'ON_HOLD', 'CUSTOMS_HOLD', 'GATE_IN', 'GATE_OUT',
        'RELEASED', 'LOADED', 'NOT_MANIFESTED'
    )),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_published_containers_ts()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_published_containers_updated_at
    BEFORE UPDATE ON published_containers
    FOR EACH ROW EXECUTE FUNCTION update_published_containers_ts();

CREATE INDEX IF NOT EXISTS idx_pc_status
    ON published_containers(current_status)
    WHERE current_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pc_terminal
    ON published_containers(terminal_code);

CREATE INDEX IF NOT EXISTS idx_pc_last_status_at
    ON published_containers(last_status_at)
    WHERE last_status_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- gate_fees
-- ---------------------------------------------------------------------------
-- Terminal fees assessed via eModal Fee Manager.
-- Populated from eModal status events and fee notifications.
-- container_id / order_id / terminal_id are nullable because this service may
-- not always have the internal UUIDs — container_number is the stable key.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS gate_fees (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    container_id     UUID,                                        -- cross-service ref to containers table
    container_number VARCHAR(11) NOT NULL,
    order_id         UUID,                                        -- cross-service ref to orders table
    terminal_id      UUID,                                        -- cross-service ref to locations table
    terminal_code    VARCHAR(20),                                 -- eModal terminal code
    type             VARCHAR(30) NOT NULL CHECK (type IN (
        'DEMURRAGE', 'STORAGE', 'GATE_FEE', 'EXTENDED_GATE_FEE', 'PER_DIEM', 'CUSTOMS_EXAM'
    )),
    amount           DECIMAL(10, 2) NOT NULL DEFAULT 0,
    currency         VARCHAR(3)  NOT NULL DEFAULT 'USD',
    billable_to      VARCHAR(100),                                -- BCO, carrier, or drayage company
    status           VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN (
        'PENDING', 'ASSESSED', 'PAID', 'WAIVED', 'DISPUTED'
    )),
    emodal_fee_id    VARCHAR(100),                                -- eModal internal fee reference
    assessed_at      TIMESTAMPTZ,
    paid_at          TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_gate_fees_ts()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_gate_fees_updated_at
    BEFORE UPDATE ON gate_fees
    FOR EACH ROW EXECUTE FUNCTION update_gate_fees_ts();

CREATE INDEX IF NOT EXISTS idx_gf_container_number ON gate_fees(container_number);
CREATE INDEX IF NOT EXISTS idx_gf_container_id     ON gate_fees(container_id)     WHERE container_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gf_order_id        ON gate_fees(order_id)         WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gf_status          ON gate_fees(status);
CREATE INDEX IF NOT EXISTS idx_gf_type            ON gate_fees(type);
CREATE INDEX IF NOT EXISTS idx_gf_terminal_code   ON gate_fees(terminal_code)    WHERE terminal_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gf_assessed_at     ON gate_fees(assessed_at)      WHERE assessed_at IS NOT NULL;
