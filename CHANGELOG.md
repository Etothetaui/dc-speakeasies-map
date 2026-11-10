# Changelog

## 0.2.2-dev — November 10, 2026

- Maximum walking distance now adjusts in 0.1-mile steps instead of 0.5-mile steps.

## 0.2.1-dev — November 10, 2026

- Food labels for all 16 bars, distinguishing meals, snacks, food in the parent restaurant/deli, and unverified service.
- Sourced opening-hours information in bar descriptions, with separate kitchen cutoffs, seasonal notes, and explicit gaps where current hours could not be verified.
- Food and hours included in exported pin descriptions, with source notes checked November 10, 2026.

## 0.2.0-dev — November 10, 2026

- Optional Metro start and finish choices: any line, a specific color, or no Metro requirement.
- Automatic station selection together with the bar group and route order; Metro walks count toward the length limit, while the circle contains bars only.
- Metro endpoints work with DC-only bars, both limits, and every route mode, and stay visible when the Metro network is hidden.
- Empty-route recovery, endpoint-aware direction caching, and distance reconciliation before showing a qualifying route.
- Added directed station walking-distance data and regression checks for combined constraints and Metro endpoints.

## 0.1.0-dev — November 10, 2026

First numbered development release.

- Guide to 16 hidden bars, including entrance notes, secrecy scores, ratings, and sources.
- Shortest, north-to-south, and list-sort walking routes with independent list sorting.
- Walking-distance and circle-radius limits that keep the largest possible group of bars.
- Six color-coded Metro lines and 98 stations, with visible colors on shared tracks and transfer stations.
- Cleanup of short backtracking artifacts in the Metro line shapes.
- DC-only and Metro off on a first visit, with later toggle choices remembered.
