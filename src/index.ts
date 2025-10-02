#!/usr/bin/env node

/**
 * Confluence MCP 서버
 *
 * 이 서버는 Confluence 통합을 위한 Model Context Protocol(MCP)을 구현합니다.
 * Confluence에서 CQL 쿼리 실행과 페이지 콘텐츠 조회 기능을 제공합니다.
 *
 * 서버는 다음과 같은 MCP 클라이언트-서버 아키텍처를 따릅니다:
 * - Confluence 기능을 제공하는 MCP 서버로 동작
 * - Confluence를 데이터 소스로 연결
 * - 표준화된 프로토콜을 통해 MCP 클라이언트와 통신
 *
 * @module ConfluenceMCPServer
 */

import axios, { AxiosRequestConfig } from "axios";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

/**
 * Confluence 설정
 *
 * Confluence 인스턴스 연결을 위한 설정값들입니다.
 * 서버 실행을 위해 필요한 항목:
 * - Confluence 인스턴스의 기본 URL
 * - API 인증 정보 (이메일과 API 키)
 */
const CONFLUENCE_URL = process.env.CONFLUENCE_URL;
const JIRA_URL = process.env.JIRA_URL;
const CONFLUENCE_API_MAIL = process.env.CONFLUENCE_API_MAIL;
const CONFLUENCE_API_KEY = process.env.CONFLUENCE_API_KEY;
/**
 * Confluence 버전 플래그
 *
 * - 설정하지 않으면 기본값으로 true(Cloud 버전)로 동작
 * - 명시적으로 'false'로 설정해야 Server 버전으로 동작
 * - true 또는 다른 값으로 설정하면 Cloud 버전으로 동작
 */
const CONFLUENCE_IS_CLOUD = process.env.CONFLUENCE_IS_CLOUD !== 'false';

// Validate required environment variables
if (
  !CONFLUENCE_URL ||
  !JIRA_URL ||
  !CONFLUENCE_API_MAIL ||
  !CONFLUENCE_API_KEY
) {
  console.error(
    "Missing required environment variables. Please check your .env file."
  );
  process.exit(1);
}

/**
 * Confluence API 기본 경로 결정
 *
 * CONFLUENCE_IS_CLOUD 환경 변수 값에 따라 API 경로를 반환합니다.
 * - true(Cloud 버전): /wiki/rest/api 경로 사용
 * - false(Server 버전): /rest/api 경로 사용
 *
 * @returns {string} Confluence API 기본 경로
 */
const getConfluenceApiBasePath = (): string => {
  return CONFLUENCE_IS_CLOUD ? `${CONFLUENCE_URL}/wiki/rest/api` : `${CONFLUENCE_URL}/rest/api`;
};

/**
 * Jira 이슈 인터페이스
 */
interface JiraIssueFields {
  project?: { key: string };
  summary?: string;
  description?: string;
  issuetype?: { name: string };
  assignee?: {
    id?: string;
    accountId?: string;
    name?: string;
  };
  priority?: {
    id?: string;
    name?: string;
  };
  [key: string]: any;
}

interface JiraTransition {
  id: string;
  name: string;
  to: {
    id: string;
    name: string;
  };
}

/**
 * 일반 텍스트를 Atlassian Document Format(ADF)으로 변환
 *
 * @param {string} text - 변환할 일반 텍스트
 * @returns {Object} ADF 형식의 객체
 */
function convertToADF(text: string): any {
  if (!text) {
    return null;
  }

  return {
    version: 1,
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: text,
          },
        ],
      },
    ],
  };
}

/**
 * MCP 서버 초기화
 *
 * 다음 설정으로 새로운 MCP 서버 인스턴스를 생성합니다:
 * - 서버 메타데이터 (이름과 버전)
 * - 사용 가능한 도구들에 대한 기능 설정
 *
 * 이 서버는 MCP 프로토콜을 통해 Confluence 작업 도구들을 제공합니다.
 */
const server = new Server(
  {
    name: "Better Confluence communication server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * 도구 정의 핸들러
 *
 * 사용 가능한 도구들을 정의하는 ListTools 요청 핸들러를 구현합니다:
 * - execute_cql_search: Confluence CQL 쿼리 실행
 * - get_page_content: 특정 Confluence 페이지 내용 조회
 * - create_page: 새로운 Confluence 페이지 생성
 * - update_page: 기존 Confluence 페이지 수정
 * - execute_jql_search: Jira JQL 쿼리 실행
 * - create_jira_issue: 새로운 Jira 이슈 생성
 * - update_jira_issue: 기존 Jira 이슈 수정
 * - transition_jira_issue: Jira 이슈 상태 변경
 * - get_board_sprints: Jira 보드에서 모든 스프린트 가져오기
 * - get_sprint_issues: 스프린트에서 모든 이슈 가져오기
 * - get_current_sprint: 현재 활성 스프린트 조회
 * - get_epic_issues: 에픽에 속한 모든 이슈 조회
 * - get_user_issues: 특정 보드에서 특정 유저와 관련된 모든 이슈 조회
 *
 * 각 도구는 다음 정보를 포함합니다:
 * - 이름과 설명
 * - 필요한 매개변수를 정의하는 입력 스키마
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "execute_cql_search",
        description: "Execute a CQL query on Confluence to search pages",
        inputSchema: {
          type: "object",
          properties: {
            cql: {
              type: "string",
              description: "CQL query string",
            },
            limit: {
              type: "integer",
              description: "Number of results to return",
              default: 10,
            },
          },
          required: ["cql"],
        },
      },
      {
        name: "get_page_content",
        description: "Get the content of a Confluence page",
        inputSchema: {
          type: "object",
          properties: {
            pageId: {
              type: "string",
              description: "Confluence Page ID",
            },
          },
          required: ["pageId"],
        },
      },
      {
        name: "create_page",
        description: "Create a new Confluence page",
        inputSchema: {
          type: "object",
          properties: {
            spaceKey: {
              type: "string",
              description: "Space key where the page will be created",
            },
            title: {
              type: "string",
              description: "Page title",
            },
            content: {
              type: "string",
              description: "Page content in storage format",
            },
            parentId: {
              type: "string",
              description: "Parent page ID (optional)",
            },
          },
          required: ["spaceKey", "title", "content"],
        },
      },
      {
        name: "update_page",
        description: "Update an existing Confluence page",
        inputSchema: {
          type: "object",
          properties: {
            pageId: {
              type: "string",
              description: "ID of the page to update",
            },
            content: {
              type: "string",
              description: "New page content in storage format",
            },
            title: {
              type: "string",
              description: "New page title (optional)",
            },
          },
          required: ["pageId", "content"],
        },
      },
      {
        name: "execute_jql_search",
        description: "Execute a JQL query on Jira to search issues",
        inputSchema: {
          type: "object",
          properties: {
            jql: {
              type: "string",
              description: "JQL query string",
            },
            limit: {
              type: "integer",
              description: "Number of results to return",
              default: 10,
            },
          },
          required: ["jql"],
        },
      },
      {
        name: "create_jira_issue",
        description: "Create a new Jira issue",
        inputSchema: {
          type: "object",
          properties: {
            project: {
              type: "string",
              description: "Project key",
            },
            summary: {
              type: "string",
              description: "Issue summary",
            },
            description: {
              type: "string",
              description: "Issue description",
            },
            issuetype: {
              type: "string",
              description: "Issue type name",
            },
            assignee: {
              type: "string",
              description: "Assignee account ID",
            },
            priority: {
              type: "string",
              description: "Priority ID",
            },
          },
          required: ["project", "summary", "issuetype"],
        },
      },
      {
        name: "update_jira_issue",
        description: "Update an existing Jira issue",
        inputSchema: {
          type: "object",
          properties: {
            issueKey: {
              type: "string",
              description: "Issue key (e.g. PROJ-123)",
            },
            summary: {
              type: "string",
              description: "New issue summary",
            },
            description: {
              type: "string",
              description: "New issue description",
            },
            assignee: {
              type: "string",
              description: "New assignee account ID",
            },
            priority: {
              type: "string",
              description: "New priority ID",
            },
          },
          required: ["issueKey"],
        },
      },
      {
        name: "transition_jira_issue",
        description: "Change the status of a Jira issue",
        inputSchema: {
          type: "object",
          properties: {
            issueKey: {
              type: "string",
              description: "Issue key (e.g. PROJ-123)",
            },
            transitionId: {
              type: "string",
              description: "Transition ID to change the issue status",
            },
          },
          required: ["issueKey", "transitionId"],
        },
      },
      {
        name: "get_board_sprints",
        description: "Get all sprints from a Jira board",
        inputSchema: {
          type: "object",
          properties: {
            boardId: {
              type: "string",
              description: "Jira board ID",
            },
            state: {
              type: "string",
              description: "Filter sprints by state (active, future, closed)",
              enum: ["active", "future", "closed"],
            },
          },
          required: ["boardId"],
        },
      },
      {
        name: "get_sprint_issues",
        description: "Get all issues from a sprint",
        inputSchema: {
          type: "object",
          properties: {
            sprintId: {
              type: "string",
              description: "Sprint ID",
            },
            fields: {
              type: "array",
              description: "List of fields to return for each issue",
              items: {
                type: "string",
              },
            },
          },
          required: ["sprintId"],
        },
      },
      {
        name: "get_current_sprint",
        description: "Get current active sprint from a board with its issues",
        inputSchema: {
          type: "object",
          properties: {
            boardId: {
              type: "string",
              description: "Jira board ID",
            },
            includeIssues: {
              type: "boolean",
              description: "Whether to include sprint issues in the response",
              default: true,
            },
          },
          required: ["boardId"],
        },
      },
      {
        name: "get_epic_issues",
        description: "Get all issues belonging to an epic",
        inputSchema: {
          type: "object",
          properties: {
            epicKey: {
              type: "string",
              description: "Epic issue key (e.g. CONNECT-1234)",
            },
            fields: {
              type: "array",
              description: "List of fields to return for each issue",
              items: {
                type: "string",
              },
            },
          },
          required: ["epicKey"],
        },
      },
      {
        name: "get_user_issues",
        description:
          "Get all issues assigned to or reported by a specific user in a board",
        inputSchema: {
          type: "object",
          properties: {
            boardId: {
              type: "string",
              description: "Jira board ID",
            },
            username: {
              type: "string",
              description: "Username to search issues for",
            },
            type: {
              type: "string",
              description: "Type of user association with issues",
              enum: ["assignee", "reporter"],
              default: "assignee",
            },
            status: {
              type: "string",
              description: "Filter by issue status",
              enum: ["open", "in_progress", "done", "all"],
              default: "all",
            },
          },
          required: ["boardId", "username"],
        },
      },
    ],
  };
});

/**
 * CQL 쿼리 실행기
 *
 * Confluence 인스턴스에 대해 CQL(Confluence Query Language) 쿼리를 실행합니다.
 * 페이지네이션과 오류 케이스를 처리합니다.
 *
 * @param {string} cql - 실행할 CQL 쿼리 문자열
 * @param {number} limit - 반환할 최대 결과 수
 * @returns {Promise<any>} 쿼리 결과 또는 오류 정보
 */
async function executeCQL(cql: string, limit: number): Promise<any> {
  try {
    const params = {
      cql,
      limit,
    };

    const response = await axios.get(
      `${getConfluenceApiBasePath()}/content/search`,
      {
        // Updated URL
        headers: getAuthHeaders().headers,
        params,
      }
    );

    return response.data;
  } catch (error: any) {
    return {
      error: error.response ? error.response.data : error.message,
    };
  }
}

/**
 * 페이지 콘텐츠 조회기
 *
 * ID를 통해 특정 Confluence 페이지의 내용을 가져옵니다.
 * 페이지의 body storage 형식을 포함합니다.
 *
 * @param {string} pageId - 조회할 Confluence 페이지 ID
 * @returns {Promise<any>} 페이지 내용 또는 오류 정보
 */
async function getPageContent(pageId: string): Promise<any> {
  try {
    const response = await axios.get(
      `${getConfluenceApiBasePath()}/content/${pageId}?expand=body.storage,version,space`,
      {
        // Updated URL
        headers: getAuthHeaders().headers,
      }
    );

    return response.data;
  } catch (error: any) {
    return {
      error: error.response ? error.response.data : error.message,
    };
  }
}

/**
 * 인증 헤더 생성기
 *
 * Confluence API 요청에 필요한 인증 헤더를 생성합니다.
 * 설정된 인증 정보를 사용하여 Basic 인증을 구성합니다.
 *
 * @returns {AxiosRequestConfig} 인증 헤더가 포함된 설정 객체
 */
function getAuthHeaders(): AxiosRequestConfig<any> {
  const authHeader = `Basic ${Buffer.from(
    `${CONFLUENCE_API_MAIL}:${CONFLUENCE_API_KEY}`
  ).toString("base64")}`;
  return {
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
  };
}

/**
 * 도구 실행 핸들러
 *
 * 요청된 도구를 실행하는 CallTool 요청 핸들러를 구현합니다:
 * - 도구 이름과 필수 매개변수 검증
 * - 도구 이름에 따른 적절한 함수 실행
 * - MCP 호환 형식으로 결과 반환
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "execute_cql_search": {
      const cql = String(request.params.arguments?.cql);
      const limit = Number(request.params.arguments?.limit ?? 10);

      if (!cql) {
        throw new Error("CQL query is required");
      }

      const response = await executeCQL(cql, limit);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    }

    case "get_page_content": {
      const pageId = String(request.params.arguments?.pageId);

      if (!pageId) {
        throw new Error("Page ID is required");
      }

      const response = await getPageContent(pageId);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    }

    case "create_page": {
      const spaceKey = String(request.params.arguments?.spaceKey);
      const title = String(request.params.arguments?.title);
      const content = String(request.params.arguments?.content);
      const parentId = request.params.arguments?.parentId
        ? String(request.params.arguments.parentId)
        : undefined;

      if (!spaceKey || !title || !content) {
        throw new Error("Space key, title, and content are required");
      }

      const response = await createPage(spaceKey, title, content, parentId);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    }

    case "update_page": {
      const pageId = String(request.params.arguments?.pageId);
      const content = String(request.params.arguments?.content);
      const title = request.params.arguments?.title
        ? String(request.params.arguments.title)
        : undefined;

      if (!pageId || !content) {
        throw new Error("Page ID and content are required");
      }

      const response = await updatePage(pageId, content, title);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    }

    case "execute_jql_search": {
      const jql = String(request.params.arguments?.jql);
      const limit = Number(request.params.arguments?.limit ?? 10);

      if (!jql) {
        throw new Error("JQL query is required");
      }

      const response = await executeJQL(jql, limit);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    }

    case "create_jira_issue": {
      const project = String(request.params.arguments?.project);
      const summary = String(request.params.arguments?.summary);
      const description = String(request.params.arguments?.description);
      const issuetype = String(request.params.arguments?.issuetype);
      const assignee = String(request.params.arguments?.assignee);
      const priority = String(request.params.arguments?.priority);

      if (!project || !summary || !issuetype) {
        throw new Error("Project, summary, and issuetype are required");
      }

      const fields: JiraIssueFields = {
        project: { key: project },
        summary,
        description,
        issuetype: { name: issuetype },
        assignee: { id: assignee },
        priority: { id: priority },
      };

      const response = await createJiraIssue(fields);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    }

    case "update_jira_issue": {
      const issueKey = String(request.params.arguments?.issueKey);
      const summary = String(request.params.arguments?.summary);
      const description = String(request.params.arguments?.description);
      const assignee = String(request.params.arguments?.assignee);
      const priority = String(request.params.arguments?.priority);

      if (!issueKey) {
        throw new Error("Issue key is required");
      }

      const fields: JiraIssueFields = {
        project: { key: summary },
        summary,
        description,
        assignee: { id: assignee },
        priority: { id: priority },
      };

      const response = await updateJiraIssue(issueKey, fields);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    }

    case "transition_jira_issue": {
      const issueKey = String(request.params.arguments?.issueKey);
      const transitionId = String(request.params.arguments?.transitionId);

      if (!issueKey || !transitionId) {
        throw new Error("Issue key and transition ID are required");
      }

      const response = await transitionJiraIssue(issueKey, transitionId);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    }

    case "get_board_sprints": {
      const boardId = String(request.params.arguments?.boardId);
      const state = request.params.arguments?.state as string | undefined;

      if (!boardId) {
        throw new Error("Board ID is required");
      }

      const response = await getBoardSprints(boardId, state);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    }

    case "get_sprint_issues": {
      const sprintId = String(request.params.arguments?.sprintId);
      const fields = request.params.arguments?.fields as string[] | undefined;

      if (!sprintId) {
        throw new Error("Sprint ID is required");
      }

      const response = await getSprintIssues(sprintId, fields);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    }

    case "get_current_sprint": {
      const boardId = String(request.params.arguments?.boardId);
      const includeIssues = request.params.arguments?.includeIssues !== false;

      if (!boardId) {
        throw new Error("Board ID is required");
      }

      // 1. 현재 활성 스프린트 조회
      const sprintsResponse = await getBoardSprints(boardId, "active");
      if (!sprintsResponse.success || !sprintsResponse.data.values.length) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { error: "No active sprint found" },
                null,
                2
              ),
            },
          ],
        };
      }

      const currentSprint = sprintsResponse.data.values[0];

      if (!includeIssues) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ sprint: currentSprint }, null, 2),
            },
          ],
        };
      }

      // 2. 스프린트의 이슈들 조회
      const issuesResponse = await getSprintIssues(String(currentSprint.id));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                sprint: currentSprint,
                issues: issuesResponse.success ? issuesResponse.issues : [],
                total: issuesResponse.success ? issuesResponse.total : 0,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "get_epic_issues": {
      const epicKey = String(request.params.arguments?.epicKey);
      const fields = request.params.arguments?.fields as string[] | undefined;

      if (!epicKey) {
        throw new Error("Epic key is required");
      }

      try {
        const params = {
          jql: `"Epic Link" = ${epicKey}`,
          fields: fields || [
            "summary",
            "status",
            "assignee",
            "priority",
            "issuetype",
          ],
          maxResults: 100,
        };

        const response = await axios.get(`${JIRA_URL}/rest/api/3/search`, {
          headers: getAuthHeaders().headers,
          params,
        });

        const issues = response.data.issues.map((issue: any) => ({
          key: issue.key,
          summary: issue.fields.summary,
          status: issue.fields.status?.name,
          assignee: issue.fields.assignee?.displayName,
          priority: issue.fields.priority?.name,
          issuetype: issue.fields.issuetype?.name,
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  total: response.data.total,
                  issues,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error:
                    error.response?.data?.errorMessages?.[0] || error.message,
                  details: error.response?.data || {},
                },
                null,
                2
              ),
            },
          ],
        };
      }
    }

    case "get_user_issues": {
      const boardId = String(request.params.arguments?.boardId);
      const username = String(request.params.arguments?.username);
      const type = String(request.params.arguments?.type || "assignee");
      const status = String(request.params.arguments?.status || "all");

      if (!boardId || !username) {
        throw new Error("Board ID and username are required");
      }

      // JQL 쿼리 구성
      let jql = `${type} = '${username}' AND board = ${boardId}`;

      // 상태 필터 추가
      switch (status) {
        case "open":
          jql += " AND status = 'To Do'";
          break;
        case "in_progress":
          jql += " AND status = '진행 중'";
          break;
        case "done":
          jql += " AND status = 'Done'";
          break;
      }

      // 이슈 조회
      const response = await executeJQL(jql, 100);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    }

    default:
      throw new Error("Unknown tool");
  }
});

/**
 * 페이지 생성기
 *
 * 새로운 Confluence 페이지를 생성합니다.
 *
 * @param {string} spaceKey - 페이지가 생성될 공간의 키
 * @param {string} title - 페이지 제목
 * @param {string} content - 페이지 내용 (storage 형식)
 * @param {string} [parentId] - 상위 페이지 ID (선택사항)
 * @returns {Promise<any>} 생성된 페이지 정보 또는 오류 정보
 */
async function createPage(
  spaceKey: string,
  title: string,
  content: string,
  parentId?: string
): Promise<any> {
  try {
    const data: any = {
      type: "page",
      title,
      space: { key: spaceKey },
      body: {
        storage: {
          value: content,
          representation: "storage",
        },
      },
    };

    if (parentId) {
      data.ancestors = [{ id: parentId }];
    }

    const response = await axios.post(
      `${getConfluenceApiBasePath()}/content`,
      data,
      getAuthHeaders()
    );

    return response.data;
  } catch (error: any) {
    return {
      error: error.response ? error.response.data : error.message,
    };
  }
}

/**
 * 페이지 수정기
 *
 * 기존 Confluence 페이지의 내용을 수정합니다.
 *
 * @param {string} pageId - 수정할 페이지 ID
 * @param {string} content - 새로운 페이지 내용 (storage 형식)
 * @param {string} [title] - 새로운 페이지 제목 (선택사항)
 * @returns {Promise<any>} 수정된 페이지 정보 또는 오류 정보
 */
async function updatePage(
  pageId: string,
  content: string,
  title?: string
): Promise<any> {
  try {
    // 현재 페이지 정보 조회
    const currentPage = await getPageContent(pageId);
    if (currentPage.error) {
      return currentPage;
    }

    const data: any = {
      id: pageId,
      type: "page",
      status: "current",
      title: title || currentPage.title,
      space: {
        key: currentPage.space.key,
        name: currentPage.space.name,
        type: "global",
      },
      version: {
        number: currentPage.version.number + 1,
        message: "Updated via API",
        minorEdit: false,
      },
      body: {
        storage: {
          value: content,
          representation: "storage",
        },
      },
      metadata: {
        properties: {
          "content-type": "page",
          "update-type": "api",
        },
      },
    };

    if (currentPage.ancestors && currentPage.ancestors.length > 0) {
      data.ancestors = currentPage.ancestors.map((ancestor: any) => ({
        id: ancestor.id,
        type: ancestor.type,
        status: ancestor.status,
      }));
    }

    const response = await axios.put(
      `${getConfluenceApiBasePath()}/content/${pageId}`,
      data,
      getAuthHeaders()
    );

    return response.data;
  } catch (error: any) {
    return {
      error: error.response ? error.response.data : error.message,
    };
  }
}

/**
 * JQL 쿼리 실행기
 *
 * Jira에서 JQL(Jira Query Language) 쿼리를 실행합니다.
 *
 * @param {string} jql - 실행할 JQL 쿼리 문자열
 * @param {number} limit - 반환할 최대 결과 수
 * @returns {Promise<any>} 쿼리 결과 또는 오류 정보
 */
async function executeJQL(jql: string, limit: number): Promise<any> {
  try {
    const defaultFields = [
      "key",
      "summary",
      "description",
      "status",
      "issuetype",
      "priority",
      "assignee",
      "updated",
    ];

    const params = {
      jql,
      maxResults: limit,
      fields: defaultFields,
      validateQuery: "strict",
    };

    const response = await axios.get(`${JIRA_URL}/rest/api/3/search`, {
      headers: getAuthHeaders().headers,
      params,
    });

    // 응답 데이터를 가공하여 필요한 정보만 반환
    const issues = response.data.issues.map((issue: any) => ({
      key: issue.key,
      summary: issue.fields.summary,
      description: issue.fields.description,
      status: issue.fields.status?.name,
      issuetype: issue.fields.issuetype?.name,
      priority: issue.fields.priority?.name,
      assignee: issue.fields.assignee?.displayName,
      updated: issue.fields.updated,
    }));

    return {
      total: response.data.total,
      issues,
    };
  } catch (error: any) {
    const errorMessage =
      error.response?.data?.errorMessages?.[0] || error.message;
    return {
      error: errorMessage,
      details: error.response?.data || {},
      status: error.response?.status,
    };
  }
}

/**
 * Jira 이슈 생성기
 *
 * 새로운 Jira 이슈를 생성합니다.
 *
 * @param {JiraIssueFields} fields - 이슈 필드 데이터
 * @returns {Promise<any>} 생성된 이슈 정보 또는 오류 정보
 */
async function createJiraIssue(fields: JiraIssueFields): Promise<any> {
  try {
    // 필수 필드 유효성 검사
    if (!fields.project?.key) {
      throw new Error("Project key is required");
    }
    if (!fields.issuetype?.name) {
      throw new Error("Issue type is required");
    }
    if (!fields.summary) {
      throw new Error("Summary is required");
    }

    // description을 ADF 형식으로 변환
    const description = fields.description
      ? convertToADF(fields.description)
      : null;

    const data = {
      fields: {
        ...fields,
        description,
        // 기본값 설정
        priority: fields.priority || { id: "3" }, // Medium priority
      },
      update: {},
    };

    const response = await axios.post(`${JIRA_URL}/rest/api/3/issue`, data, {
      ...getAuthHeaders(),
      headers: {
        ...getAuthHeaders().headers,
        "X-Atlassian-Token": "no-check",
      },
    });

    return {
      success: true,
      data: response.data,
      key: response.data.key,
      id: response.data.id,
      self: response.data.self,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.errorMessages?.[0] || error.message,
      details: error.response?.data || {},
      status: error.response?.status,
    };
  }
}

/**
 * Jira 이슈 수정기
 *
 * 기존 Jira 이슈를 수정합니다.
 *
 * @param {string} issueKey - 수정할 이슈 키
 * @param {JiraIssueFields} fields - 수정할 필드 데이터
 * @returns {Promise<any>} 수정된 이슈 정보 또는 오류 정보
 */
async function updateJiraIssue(
  issueKey: string,
  fields: JiraIssueFields
): Promise<any> {
  try {
    if (!issueKey) {
      throw new Error("Issue key is required");
    }

    // description만 업데이트하는 간단한 요청
    const updateData = {
      fields: {},
    };

    // description이 있을 때만 포함
    if (fields.description) {
      updateData.fields = {
        description: convertToADF(fields.description),
      };
    }

    const response = await axios.put(
      `${JIRA_URL}/rest/api/3/issue/${issueKey}`,
      updateData,
      {
        headers: {
          ...getAuthHeaders().headers,
          "X-Atlassian-Token": "no-check",
          "Content-Type": "application/json",
        },
      }
    );

    return {
      success: true,
      status: response.status,
      message: "Issue updated successfully",
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.errorMessages?.[0] || error.message,
      details: error.response?.data || {},
      status: error.response?.status,
    };
  }
}

/**
 * Jira 이슈 상태 변경기
 *
 * Jira 이슈의 상태를 변경합니다.
 *
 * @param {string} issueKey - 상태를 변경할 이슈 키
 * @param {string} transitionId - 변경할 상태의 transition ID
 * @returns {Promise<any>} 변경 결과 또는 오류 정보
 */
async function transitionJiraIssue(
  issueKey: string,
  transitionId: string
): Promise<any> {
  try {
    if (!issueKey) {
      throw new Error("Issue key is required");
    }
    if (!transitionId) {
      throw new Error("Transition ID is required");
    }

    // 현재 가능한 transition 확인
    const transitionsResponse = await axios.get(
      `${JIRA_URL}/rest/api/3/issue/${issueKey}/transitions`,
      getAuthHeaders()
    );

    const availableTransitions = transitionsResponse.data.transitions;
    const isValidTransition = availableTransitions.some(
      (t: JiraTransition) => t.id === transitionId
    );

    if (!isValidTransition) {
      throw new Error(
        `Invalid transition ID: ${transitionId}. Available transitions: ${availableTransitions
          .map((t: JiraTransition) => `${t.id} (${t.name})`)
          .join(", ")}`
      );
    }

    const data = {
      transition: {
        id: transitionId,
      },
      historyMetadata: {
        type: "mcp",
        description: "Status updated via MCP API",
        activityDescription: "issue_transitioned",
        actor: {
          type: "application",
          id: "mcp-server",
        },
      },
    };

    const response = await axios.post(
      `${JIRA_URL}/rest/api/3/issue/${issueKey}/transitions`,
      data,
      {
        ...getAuthHeaders(),
        headers: {
          ...getAuthHeaders().headers,
          "X-Atlassian-Token": "no-check",
        },
      }
    );

    return {
      success: true,
      status: response.status,
      message: "Issue status updated successfully",
      transition: availableTransitions.find(
        (t: JiraTransition) => t.id === transitionId
      ),
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.errorMessages?.[0] || error.message,
      details: error.response?.data || {},
      status: error.response?.status,
    };
  }
}

/**
 * 보드의 스프린트 조회
 *
 * Jira 보드의 모든 스프린트를 조회합니다.
 *
 * @param {string} boardId - Jira 보드 ID
 * @param {string} [state] - 스프린트 상태 필터 (active, future, closed)
 * @returns {Promise<any>} 스프린트 목록 또는 오류 정보
 */
async function getBoardSprints(boardId: string, state?: string): Promise<any> {
  try {
    const params: any = {};
    if (state) {
      params.state = state;
    }

    const response = await axios.get(
      `${JIRA_URL}/rest/agile/1.0/board/${boardId}/sprint`,
      {
        headers: getAuthHeaders().headers,
        params,
      }
    );

    return {
      success: true,
      data: response.data,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.errorMessages?.[0] || error.message,
      details: error.response?.data || {},
      status: error.response?.status,
    };
  }
}

/**
 * 스프린트의 이슈 조회
 *
 * 특정 스프린트의 모든 이슈를 조회합니다.
 *
 * @param {string} sprintId - 스프린트 ID
 * @param {string[]} [fields] - 반환할 이슈 필드 목록
 * @returns {Promise<any>} 이슈 목록 또는 오류 정보
 */
async function getSprintIssues(
  sprintId: string,
  fields?: string[]
): Promise<any> {
  try {
    const defaultFields = [
      "key",
      "summary",
      "status",
      "assignee",
      "priority",
      "issuetype",
    ];

    const params = {
      fields: fields || defaultFields,
    };

    const response = await axios.get(
      `${JIRA_URL}/rest/agile/1.0/sprint/${sprintId}/issue`,
      {
        headers: getAuthHeaders().headers,
        params,
      }
    );

    // 응답 데이터를 가공하여 필요한 정보만 반환
    const issues = response.data.issues.map((issue: any) => ({
      key: issue.key,
      summary: issue.fields.summary,
      status: issue.fields.status?.name,
      assignee: issue.fields.assignee?.displayName,
      priority: issue.fields.priority?.name,
      issuetype: issue.fields.issuetype?.name,
    }));

    return {
      success: true,
      total: response.data.total,
      issues,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.errorMessages?.[0] || error.message,
      details: error.response?.data || {},
      status: error.response?.status,
    };
  }
}

/**
 * 서버 진입점
 *
 * MCP 서버를 초기화하고 시작합니다:
 * - MCP 통신을 위한 stdio 전송 계층 생성
 * - 서버를 전송 계층에 연결
 * - 시작 오류 처리
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
