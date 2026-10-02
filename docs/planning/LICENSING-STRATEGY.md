# Loxora Licensing Strategy

**Status:** Open decision  
**Current repository license:** MIT  
**Last Updated:** September 2026

## Purpose

Loxora's long-term product vision now includes both an open-source local core and optional commercial services such as managed compute, provider routing, extension discovery, and hosted collaboration.

The current MIT license should therefore be reviewed deliberately before the contributor base and commercial surface grow.

This document records the decision space. It does not change the repository license.

## Current MIT implications

MIT is a permissive open-source license.

It permits use, modification, distribution, sublicensing, and commercial use subject primarily to preservation of the copyright and license notice.

That is compatible with:
- a free open-source local core,
- paid hosted services,
- paid support,
- managed compute,
- proprietary service-side software in separate components,
- and third-party commercial adoption.

The trade-off is that MIT also permits another party to fork the core, modify it, distribute proprietary derivatives, and offer competing commercial services subject to the license notice requirements.

For Loxora this is not automatically a problem. The business may choose to compete on trust, ecosystem, managed infrastructure, brand, integration quality, and convenience rather than license restrictions.

## Questions the license decision must answer

Before changing the license, decide which outcome matters most.

1. Is maximum adoption by developers and companies the priority?
2. Is it acceptable for a third party to offer a closed hosted Loxora service based on the core?
3. Should modifications to the core remain open?
4. Should modifications used only to provide a network service also be published?
5. Is commercial dual licensing desirable?
6. Will external contributors be accepted?
7. Does Ocomic need the ability to relicense future contributions?
8. Which components are intended to stay open source permanently?
9. Which hosted components may remain proprietary?
10. How should the Loxora name and trademarks be protected independently of source licensing?

## Candidate strategies

### Option A — Remain MIT

**Characteristics**
- permissive,
- simple,
- familiar,
- low adoption friction,
- commercial use and proprietary derivatives allowed.

**Fits best when**
- ecosystem growth is the main priority,
- Loxora expects the moat to be product quality, hosted convenience, brand, infrastructure, and community,
- competing hosted forks are acceptable.

**Primary concern**
- little license-based protection against commercial hosted forks.

### Option B — Apache License 2.0

**Characteristics**
- permissive,
- commercial use and proprietary derivatives remain possible,
- includes an explicit contributor patent license and patent-termination provisions,
- includes clearer treatment of notices and contributions than MIT.

**Fits best when**
- Loxora wants permissive adoption similar to MIT,
- enterprise adoption and explicit patent terms are valued.

**Primary concern**
- it still does not prevent closed or competing hosted forks.

### Option C — Mozilla Public License 2.0

**Characteristics**
- file-level weak copyleft,
- modified MPL-covered files generally remain under MPL,
- larger works can include differently licensed files.

**Fits best when**
- changes to core files should remain open,
- while allowing broad integration into commercial systems.

**Primary concern**
- more compliance complexity than MIT or Apache,
- does not specifically solve every hosted-service concern.

### Option D — GNU AGPLv3

**Characteristics**
- strong copyleft,
- modified network-served versions must offer corresponding source to remote users,
- commercial use is still allowed.

**Fits best when**
- preventing closed modifications of the network-facing core is an important goal,
- Loxora wants improvements to deployed modified versions to remain available.

**Primary concerns**
- higher adoption friction for some companies,
- stronger compatibility and compliance implications,
- careful separation may be needed between AGPL core and proprietary services.

### Option E — AGPL plus commercial licensing

A copyright holder may offer the same code under more than one license.

One possible model is:
- open-source AGPL for the community,
- separate commercial terms for customers who need different rights.

This can support an open-core business, but only if Loxora has sufficient rights to grant both licenses.

As external contributions grow, rights management becomes important.

A Contributor License Agreement or another explicit contribution policy may be needed if Ocomic wants predictable future relicensing or dual-licensing rights.

This requires professional legal review before adoption.

### Source-available licenses

Licenses that restrict competitors from offering the software as a service may be commercially useful but may no longer satisfy the Open Source Definition.

If Loxora promises to remain open source, this distinction should remain explicit.

## Preliminary direction

Do not change the current license solely because commercial services are planned.

The current vision is compatible with MIT.

Before implementation of Loxora Cloud, Hub, or managed Compute, make an explicit licensing decision based on one of two product directions:

### Adoption-first direction

Prefer a permissive license.

Candidates:
1. Apache-2.0
2. MIT

Apache-2.0 deserves particular consideration if explicit patent terms and a more formal contribution model are desirable.

### Open-core-protection direction

Evaluate AGPLv3 for the core together with a separately licensed hosted service layer.

If commercial dual licensing is desired, establish contribution rights before accepting substantial third-party contributions.

## Existing releases and relicensing

Loxora is already publicly available under MIT.

Any future license change should be treated as a real relicensing project, not a text-file replacement.

Before changing:
- audit copyright ownership and contributor history,
- determine whether Ocomic controls the rights required for the change,
- identify third-party code or documentation,
- review dependency license compatibility,
- decide how earlier MIT releases are described and supported,
- and obtain legal review.

As contributor count grows, relicensing generally becomes more difficult because contributors may hold copyright in their contributions.

Therefore the strategic license decision is easier to make early than after a large external contributor ecosystem exists.

## Hosted-service boundary

Even if the core remains permissively licensed, proprietary hosted components can be separated by architecture and repository boundaries when they are genuinely separate works/services.

The future design should clearly define:
- local-core protocols,
- remote-worker protocols,
- Hub APIs,
- hosted billing,
- provider credentials,
- marketplace services,
- and optional synchronization services.

The license must not be used as a substitute for a well-defined architecture boundary.

## Trademark

Source-code licensing and branding are separate questions.

Loxora should eventually define a trademark policy for the Loxora name, logos, official hosted service, and compatibility claims.

A permissive source license does not require permissive trademark use.

## Decision gate

Resolve the long-term license before whichever comes first:
- accepting substantial external code contributions,
- shipping a stable public release intended for broad adoption,
- launching a paid Loxora-hosted service,
- or introducing a commercial dual-license program.

## Legal note

This document is product and engineering planning, not legal advice.

Before relicensing or adopting dual licensing, obtain qualified legal review for the actual repository history, contributor agreements, dependencies, jurisdictions, and commercial structure.
