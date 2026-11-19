# NightJar Creator Pool — £3,000 ceiling and expansion gate

**Status:** implementation proposal in `feat/creator-pool-cap-growth-gate`. Not production-deployed.  
**Currency:** GBP, integer pence.  
**Owner decision:** proposed hard monthly payout ceiling of £3,000 per eligible creator.

## 1. Monthly pool calculation

The Creator Pool continues to receive 50% of reconciled Eligible Net Subscription Revenue under the effective finance policy. Existing settlement reconciliation remains the source of truth; subscriber counts, MRR, trials and unpaid invoices are not treated as cash received.

For each monthly period:

`monthlyContribution = 50% × eligibleNetRevenue`

`availablePool = openingRetainedBalance + monthlyContribution`

The opening retained balance is the previous approved period's retained Creator Pool balance. It is carried once into the new period and snapshotted there.

## 2. Equal allocation with the hard ceiling

The eligible population remains server-derived:

- account is active;
- at least one approved paid creative role (VA Creator, Writer, Audio Editor or Artist);
- that approved role has completed its applicable period commitments, including approved evidence or a documented authorised exception;
- multiple qualifying roles still produce one individual share.

The allocator divides the available pool equally by eligible individual, then applies a maximum payout of **£3,000 (300,000 pence) per person for that monthly period**.

`individualPayout = min(£3,000, floor(availablePool / eligibleCreatorCount))`

The remaining pool is:

`retainedBalance = availablePool − sum(individualPayouts)`

The excess is retained at **Creator Pool level**. It is not recorded as a personal entitlement, a personal carry-forward or an amount owed to a specific creator. It remains separately visible in the Creator Pool ledger and is not transferred to NightJar operations, Meg & Mike or another allocation.

Where no creator qualifies, the entire available pool remains retained. There is no automatic forfeiture or transfer to the business.

All calculations use integer pence. Any remainder pennies below the ceiling are assigned using a rotating deterministic order so the same person does not systematically receive the extra penny.

## 3. Worked example

Five eligible creators; £25,000 total available pool:

| Item | Amount |
|---|---:|
| Available Creator Pool | £25,000 |
| Eligible individuals | 5 |
| Monthly ceiling per person | £3,000 |
| Paid / allocated | £15,000 |
| Retained Creator Pool | **£10,000** |

Next month, assume another £25,000 contribution and the retained £10,000 rolls forward. If ten people are then eligible, £35,000 is available: ten payouts of £3,000 and £5,000 remains retained.

The following month, if the new monthly contribution remains £25,000, the £5,000 retained balance gives £30,000 available: ten payouts of £3,000. This illustrates how the retained pool can bridge an expansion period, but it does not prove the expansion is sustainably funded.

## 4. Creator Expansion Gate

The admin Compensation Control Centre includes an assessment for a proposed **total** eligible roster size after expansion.

It requires three consecutive, approved monthly payout periods. The assessment calculates:

1. Each period's actual allocation per eligible person.
2. A protected monthly payout benchmark: the average per-person allocation across those periods, capped at £3,000.
3. The minimum of the three **new monthly Creator Pool contributions** (not opening carry-forward balances).
4. The recurring contribution required for the proposed roster: `proposedRoster × protectedBenchmark`.

The status is 'ready' only where the minimum of all three monthly contributions meets or exceeds the required recurring amount. Otherwise it is 'not_ready'. Fewer than three consecutive approved periods, a gap in months or an invalid period produces 'insufficient_history'.

This is intentionally conservative: the retained balance is displayed separately and is excluded from recurring-income sustainability. A green status means **ready for founder review**, not automatic recruitment or an income guarantee. It does not add members to the pool.

## 5. Soft Creator and credit-only profiles

Soft Creators and other credit-only contributors remain eligible for profile recognition and verified work credits, but are not Creator Pool members solely because they are credited. The payout allocator only accepts server-derived approved paid creative roles and completed commitment roles. A profile label, verified credit, public credit, listener status or credited work does not grant a paid role or payout eligibility.

## 6. Payment workflow and controls

- The payout period is prepared as a draft only after the commitment period is closed and revenue sources are reconciled, or an approved retained pool balance exists to distribute.
- The draft snapshots monthly contribution, opening retained balance, total available pool, individual ceiling, retained closing balance, allocation policy and rounding cursor.
- Admin approval remains a separate step.
- Monzo payments remain manual: NightJar records the actual bank transfer reference and amount after it happens. This change does not initiate bank transfers.
- Payment references remain idempotent and conflicting retries are rejected.
- Closed historical periods are not recalculated by later cap or finance-policy changes.
- The cap is currently a server constant of £3,000 per monthly period. Any future change should be versioned and effective-dated; it must not rewrite closed payout periods.

## 7. Contract and release dependency

The current founder-review Schedule C draft must be amended and legally reviewed before this model is used for real creator payments. It needs to state clearly:

- the £3,000 monthly individual ceiling;
- that the ceiling is a contractual maximum for the period, not a deferred entitlement;
- that amounts above the ceiling remain in the shared Creator Pool and are not carried forward to an individual;
- how the retained balance is applied in later periods;
- that the pool may be divided among the eligible roster for each period under the published eligibility table;
- how creators are notified of policy changes, with no retrospective reduction of already accrued payments.

Do not issue the current unamended draft for signature or treat this code change as legal approval. Accountant/legal review and founder acceptance remain release gates.

## 8. Test coverage

The creator-pool unit tests cover:
- £25,000 / five creators / £3,000 ceiling = £15,000 allocated and £10,000 retained;
- retained balance plus new contribution supporting ten capped creators;
- exact £30,000 for ten creators = £3,000 each;
- rotating remainder pennies;
- multi-role deduplication and no duplicate payouts;
- inactive, unapproved and Soft Creator credit-only profiles excluded;
- zero eligible creators retaining the whole pool;
- expansion readiness requiring three consecutive approved periods;
- retained balances excluded from the recurring expansion test;
- invalid amounts, cap and roster sizes rejected.
