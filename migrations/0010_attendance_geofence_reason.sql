-- Migration 0010: Reason for clocking in/out outside the office geofence
ALTER TABLE attendance ADD COLUMN clock_in_geofence_reason TEXT;
ALTER TABLE attendance ADD COLUMN clock_out_geofence_reason TEXT;
