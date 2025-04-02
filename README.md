# Better Confluence Communication Server

## Overview

This server implements the Model Context Protocol (MCP) for Confluence integration.
**This version addresses and fixes bugs found in the existing Confluence server, providing a more stable and reliable experience.**
It provides functionalities to execute CQL queries and retrieve page content from Confluence.

This server follows the MCP client-server architecture:

- Acts as an MCP server providing Confluence functionalities
- Connects to Confluence as a data source
- Communicates with MCP clients through a standardized protocol

# How to use

[![smithery badge](https://smithery.ai/badge/@zereight/confluence-mcp)](https://smithery.ai/server/@zereight/confluence-mcp)

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
        "CONFLUENCE_API_KEY": "KEY_FROM: https://id.atlassian.com/manage-profile/security/api-tokens",
        "CONFLUENCE_IS_CLOUD": "true" // Set to "false" for Server/Data Center
      }
    }
  }
}
```

## Using with Cursor

### Installing via Smithery

To install Confluence communication server for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@zereight/confluence-mcp):

```bash
npx -y @smithery/cli install @zereight/confluence-mcp --client claude
```

When using with Cursor, you can set up environment variables and run the server as follows:

```bash
env CONFLUENCE_API_MAIL=your@email.com CONFLUENCE_API_KEY=your-key CONFLUENCE_URL=your-confluence-url JIRA_URL=your-jira-url npx -y @zereight/mcp-confluence
```

- `CONFLUENCE_API_MAIL`: Your email address for the Confluence API.
- `CONFLUENCE_API_KEY`: Your Confluence API key.
- `CONFLUENCE_URL`: Your Confluence URL.
- `JIRA_URL`: Your JIRA URL.
- `CONFLUENCE_IS_CLOUD`: Determines Confluence version (Cloud or Server)
  - Default: true (Cloud version)
  - Set to 'false' explicitly for Server/Data Center version
  - Affects API endpoint paths:
    - Cloud: `/wiki/rest/api`
    - Server: `/rest/api`

### Confluence Tools

- **execute_cql_search**: Executes a CQL query on Confluence to search pages.

  - Description: Executes a CQL query on the Confluence instance to search for pages.
  - Input Schema:
    ```json
    {
      "type": "object",
      "properties": {
        "cql": {
          "type": "string",
          "description": "CQL query string"
        },
        "limit": {
          "type": "integer",
          "description": "Number of results to return",
          "default": 10
        }
      },
      "required": ["cql"]
    }
    ```

- **get_page_content**: Retrieves the content of a specific Confluence page.

  - Description: Gets the content of a Confluence page using the page ID.
  - Input Schema:
    ```json
    {
      "type": "object",
      "properties": {
        "pageId": {
          "type": "string",
          "description": "Confluence Page ID"
        }
      },
      "required": ["pageId"]
    }
    ```

- **create_page**: Creates a new Confluence page.

  - Description: Creates a new page in the specified Confluence space.
  - Input Schema:
    ```json
    {
      "type": "object",
      "properties": {
        "spaceKey": {
          "type": "string",
          "description": "Space key where the page will be created"
        },
        "title": {
          "type": "string",
          "description": "Page title"
        },
        "content": {
          "type": "string",
          "description": "Page content in storage format"
        },
        "parentId": {
          "type": "string",
          "description": "Parent page ID (optional)"
        }
      },
      "required": ["spaceKey", "title", "content"]
    }
    ```

- **update_page**: Updates an existing Confluence page.
  - Description: Updates the content of an existing Confluence page.
  - Input Schema:
    ```json
    {
      "type": "object",
      "properties": {
        "pageId": {
          "type": "string",
          "description": "ID of the page to update"
        },
        "content": {
          "type": "string",
          "description": "New page content in storage format"
        },
        "title": {
          "type": "string",
          "description": "New page title (optional)"
        }
      },
      "required": ["pageId", "content"]
    }
    ```

### Jira Tools

- **execute_jql_search**: Executes a JQL query on Jira to search issues.

  - Description: Executes a JQL query on the Jira instance to search for issues.
  - Input Schema:
    ```json
    {
      "type": "object",
      "properties": {
        "jql": {
          "type": "string",
          "description": "JQL query string"
        },
        "limit": {
          "type": "integer",
          "description": "Number of results to return",
          "default": 10
        }
      },
      "required": ["jql"]
    }
    ```

- **create_jira_issue**: Creates a new Jira issue.

  - Description: Creates a new issue in the specified Jira project.
  - Input Schema:
    ```json
    {
      "type": "object",
      "properties": {
        "project": {
          "type": "string",
          "description": "Project key"
        },
        "summary": {
          "type": "string",
          "description": "Issue summary"
        },
        "description": {
          "type": "string",
          "description": "Issue description"
        },
        "issuetype": {
          "type": "string",
          "description": "Issue type name"
        },
        "assignee": {
          "type": "string",
          "description": "Assignee account ID"
        },
        "priority": {
          "type": "string",
          "description": "Priority ID"
        }
      },
      "required": ["project", "summary", "issuetype"]
    }
    ```

- **update_jira_issue**: Updates an existing Jira issue.

  - Description: Updates fields of an existing Jira issue.
  - Input Schema:
    ```json
    {
      "type": "object",
      "properties": {
        "issueKey": {
          "type": "string",
          "description": "Issue key (e.g., PROJ-123)"
        },
        "summary": {
          "type": "string",
          "description": "New issue summary"
        },
        "description": {
          "type": "string",
          "description": "New issue description"
        },
        "assignee": {
          "type": "string",
          "description": "New assignee account ID"
        },
        "priority": {
          "type": "string",
          "description": "New priority ID"
        }
      },
      "required": ["issueKey"]
    }
    ```

- **transition_jira_issue**: Changes the status of a Jira issue.

  - Description: Changes the status of a Jira issue using transition ID.
  - Input Schema:
    ```json
    {
      "type": "object",
      "properties": {
        "issueKey": {
          "type": "string",
          "description": "Issue key (e.g. PROJ-123)"
        },
        "transitionId": {
          "type": "string",
          "description": "Transition ID to change the issue status"
        }
      },
      "required": ["issueKey", "transitionId"]
    }
    ```

- **get_board_sprints**: Get all sprints from a Jira board.

  - Description: Retrieves all sprints from a specified Jira board.
  - Input Schema:
    ```json
    {
      "type": "object",
      "properties": {
        "boardId": {
          "type": "string",
          "description": "Jira board ID"
        },
        "state": {
          "type": "string",
          "description": "Filter sprints by state (active, future, closed)",
          "enum": ["active", "future", "closed"]
        }
      },
      "required": ["boardId"]
    }
    ```

- **get_sprint_issues**: Get all issues from a sprint.

  - Description: Retrieves all issues from a specified sprint.
  - Input Schema:
    ```json
    {
      "type": "object",
      "properties": {
        "sprintId": {
          "type": "string",
          "description": "Sprint ID"
        },
        "fields": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "List of fields to return for each issue"
        }
      },
      "required": ["sprintId"]
    }
    ```

- **get_current_sprint**: Get current active sprint from a board with its issues.

  - Description: Retrieves the current active sprint and its issues from a specified board.
  - Input Schema:
    ```json
    {
      "type": "object",
      "properties": {
        "boardId": {
          "type": "string",
          "description": "Jira board ID"
        },
        "includeIssues": {
          "type": "boolean",
          "description": "Whether to include sprint issues in the response",
          "default": true
        }
      },
      "required": ["boardId"]
    }
    ```

- **get_epic_issues**: Get all issues belonging to an epic.

  - Description: Retrieves all issues that belong to a specified epic.
  - Input Schema:
    ```json
    {
      "type": "object",
      "properties": {
        "epicKey": {
          "type": "string",
          "description": "Epic issue key (e.g. CONNECT-1234)"
        },
        "fields": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "List of fields to return for each issue"
        }
      },
      "required": ["epicKey"]
    }
    ```

- **get_user_issues**: Get all issues assigned to or reported by a specific user in a board.

  - Description: Retrieves all issues associated with a specific user in a board.
  - Input Schema:
    ```json
    {
      "type": "object",
      "properties": {
        "boardId": {
          "type": "string",
          "description": "Jira board ID"
        },
        "username": {
          "type": "string",
          "description": "Username to search issues for"
        },
        "type": {
          "type": "string",
          "description": "Type of user association with issues",
          "enum": ["assignee", "reporter"],
          "default": "assignee"
        },
        "status": {
          "type": "string",
          "description": "Filter by issue status",
          "enum": ["open", "in_progress", "done", "all"],
          "default": "all"
        }
      },
      "required": ["boardId", "username"]
    }
    ```
