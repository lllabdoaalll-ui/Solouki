# Solouki Baseline 4.62.17

## Purpose
Fix the Analytics tab database connection error caused by ambiguous legacy PostgreSQL/PostgREST RPC definitions.

## Main change
The Analytics page now calls the uniquely named RPC:
`public.get_behavior_analytics_v2(date,date,text)`

The SQL migration removes the legacy exact-signature function when present, creates the v2 function, grants execution to `authenticated`, and requests a PostgREST schema-cache reload.

## Version consistency
All relevant application/cache-busting references are 4.62.17.

## Data safety
The analytics migration does not delete or modify students, violations, or other application records.
