# SpareHand AI — Claude plugin marketplace

Plugins for consulting and client delivery work.

## Install

```
/plugin marketplace add msnimbal/sparehandai
/plugin install requirements-to-proposal@sparehand
```

## Plugins

| Plugin | Purpose |
| --- | --- |
| [`requirements-to-proposal`](plugins/requirements-to-proposal/) | Turn raw client requirements — meeting notes, chat threads, voice recordings, emails, documents — into a scope document, a PDF, and matching CRM records that stay in sync through every revision. |

## Tool-agnostic by design

Plugins here name tool *categories* rather than products. A file referring to `~~CRM` means whatever CRM you connect — Twenty, HubSpot, Salesforce, Pipedrive, Attio, Zoho. Each plugin's `CONNECTORS.md` lists what it needs and what's optional.

## Layout

```
.claude-plugin/marketplace.json      marketplace manifest
plugins/<plugin>/
  .claude-plugin/plugin.json         plugin manifest
  skills/<skill>/SKILL.md            auto-discovered
  CONNECTORS.md                      tool categories used
```

Frontmatter `name` and `description` decide when Claude reaches for a skill — the description matters more than the body.

## Conventions

**Method, not findings.** A skill holds how the work is done. Anything about a specific client, platform or vendor — an API limit, a price, a product quirk — belongs in that client's records, not in a skill. Findings go stale; method doesn't.

**Record what actually broke.** The failure modes documented in these skills are real ones, hit in practice. They're worth more to the next run than a description of the happy path.

## Contributing

One skill per directory. Keep steps ordered and imperative. Bump the version in both `plugin.json` and `marketplace.json` when a plugin changes.

## License

MIT — see [LICENSE](LICENSE).
