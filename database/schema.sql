-- Run this in your Supabase SQL Editor
CREATE TABLE IF NOT EXISTS coffee_prices (
    id          SERIAL PRIMARY KEY,
    coffee_type TEXT NOT NULL,
    price       NUMERIC NOT NULL,
    district    TEXT NOT NULL,
    source      TEXT NOT NULL,
    date        TIMESTAMP NOT NULL DEFAULT NOW()
);
