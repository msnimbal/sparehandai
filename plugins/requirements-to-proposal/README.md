# Requirements to Proposal

Turns whatever a client actually gave you — a rambling discovery call, a WhatsApp thread, a scanned brief, an email chain — into three things that stay in sync: a scope document you can send, a PDF, and CRM records that match it.

## Install

```
/plugin marketplace add msnimbal/sparehandai
/plugin install requirements-to-proposal@sparehand
```

Then connect a CRM (see [CONNECTORS.md](CONNECTORS.md)) and say something like *"scope the requirements call in this folder"*.

## What it does

1. **Gathers** requirements from a bounded set of sources — including audio, transcribed locally when no hosted service is reachable.
2. **Assesses** before scoping: what the client actually asked for, and whether the platforms involved permit it.
3. **Writes `scope.json`** — one file every output is generated from.
4. **Generates** the scope document as an Artifact and a PDF, verifying the layout before publishing.
5. **Creates CRM records** — account, contacts, one opportunity per workstream, with the source material and decisions attached.
6. **Revises** by editing `scope.json` and regenerating, so the document, the PDF and the CRM never drift apart.

## Why it exists

Proposals get revised four or five times before anyone signs. The usual failure isn't writing the first draft — it's that by revision three the sent PDF, the CRM record and the doc in the shared drive all say different things, and nobody knows which is current.

This plugin makes one file the source of truth and regenerates everything from it.

## What's opinionated about it

- **Scope before opportunities.** CRM records get created after workstreams settle, not before, so you aren't renaming and deleting deals every time the scope moves.
- **Never scope what a platform forbids.** Third-party API limits get verified against live documentation during assessment, not discovered mid-build.
- **Findings go in the CRM, not the skill.** Platform quirks and client specifics are dated facts; they belong with the client, not baked into a method.
- **Constraints are stated where they bite.** Anything left unsaid in a scope document becomes a promise.

## Requires

A CRM connector. Everything else is optional — see [CONNECTORS.md](CONNECTORS.md).

## License

MIT
