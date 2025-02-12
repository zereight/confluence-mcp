# How to use

<a href="https://glama.ai/mcp/servers/p7fnmpaukj"><img width="380" height="200" src="https://glama.ai/mcp/servers/p7fnmpaukj/badge" alt="confluence-mcp MCP server" /></a>

## Using with Claude App, Cline, Roo Code

When using with the Claude App, you need to set up your API key and URLs directly.

```json
{
  "mcpServers": {
    "Confluence communication server": {
      "command": "npx",
      "args": ["-y", "@zereight/mcp-confluence"],
      "env": {
        "CONFLUENCE_URL": "https://XXXXXXXX.atlassian.net",
        "JIRA_URL": "https://XXXXXXXX.atlassian.net",
        "CONFLUENCE_API_MAIL": "Your email",
        "CONFLUENCE_API_KEY": "KEY_FROM: https://id.atlassian.com/manage-profile/security/api-tokens"
      }
    }
  }
}
```

## Using with Cursor

When using with Cursor, you can set up environment variables and run the server as follows:

```bash
env CONFLUENCE_API_MAIL=your@email.com CONFLUENCE_API_KEY=your-key CONFLUENCE_URL=your-confluence-url JIRA_URL=your-jira-url npx -y @zereight/mcp-confluence
```

- `CONFLUENCE_API_MAIL`: Your email address for the Confluence API.
- `CONFLUENCE_API_KEY`: Your Confluence API key.
- `CONFLUENCE_URL`: Your Confluence URL.
- `JIRA_URL`: Your JIRA URL.
