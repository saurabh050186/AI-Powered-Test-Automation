import { NextResponse } from "next/server";

const MAX_ERROR_SNIPPET = 300;

async function parseAzureJsonResponse(response: Response, context: string) {
  const contentType = response.headers.get("content-type") || "unknown";
  const rawBody = await response.text();

  if (!rawBody) {
    throw new Error(`${context}: Empty response from Azure DevOps.`);
  }

  if (!contentType.toLowerCase().includes("application/json")) {
    const snippet = rawBody.slice(0, MAX_ERROR_SNIPPET).replace(/\s+/g, " ").trim();
    throw new Error(
      `${context}: Azure DevOps returned non-JSON content (${contentType}). ` +
        `Check organization/project/token configuration. Response starts with: ${snippet}`
    );
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    const snippet = rawBody.slice(0, MAX_ERROR_SNIPPET).replace(/\s+/g, " ").trim();
    throw new Error(
      `${context}: Azure DevOps returned invalid JSON. Response starts with: ${snippet}`
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { azureOrg, azureProject, azureToken, itemId } = body;

    // Require credentials for Azure DevOps API
    if (!azureOrg || !azureProject || !azureToken) {
      return NextResponse.json(
        { error: "Missing Azure DevOps credentials. Please configure them in the details panel." },
        { status: 400 }
      );
    }

    // Real Azure DevOps API call
    const domain = `https://dev.azure.com/${azureOrg}/${azureProject}`;

    const credentials = Buffer.from(`:${azureToken}`).toString('base64');
    let values = [];

    if (itemId) {
      // Fetch specific Work Item by ID
      const detailsUrl = `${domain}/_apis/wit/workitems/${itemId}?$expand=all&api-version=7.1`;
      
      const detailsRes = await fetch(detailsUrl, {
        method: "GET",
        headers: {
          "Authorization": `Basic ${credentials}`,
          "Accept": "application/json"
        }
      });

      if (!detailsRes.ok) {
        if (detailsRes.status === 404) {
             throw new Error(`Work Item ${itemId} not found`);
        }
        throw new Error(`Azure DevOps Details Error: ${detailsRes.status}`);
      }

      const issue = await parseAzureJsonResponse(detailsRes, `Work item ${itemId} response`);
      values = [issue];
    } else {
      // Step 1: WIQL to get Work Items of type User Story / PBI
      const wiqlUrl = `${domain}/_apis/wit/wiql?api-version=7.1`;
      const jqlQuery = "Select [System.Id] From WorkItems Where [System.WorkItemType] IN ('User Story', 'Product Backlog Item') AND [System.State] <> 'Closed'";
      
      const res = await fetch(wiqlUrl, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${credentials}`,
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query: jqlQuery
        })
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error(`Azure DevOps Query Failure: ${res.status} ${res.statusText} - ${errorText}`);
        throw new Error(`Azure DevOps API Error: ${res.status} ${res.statusText}`);
      }

      const data: any = await parseAzureJsonResponse(res, "WIQL query response");
      const workItems = data.workItems || [];
      
      if (workItems.length === 0) {
        return NextResponse.json({ stories: [] });
      }

      // Step 2: Fetch details for those Work Items
      const batchUrl = `${domain}/_apis/wit/workitemsbatch?api-version=7.1`;
      const topIds = workItems.slice(0, 50).map((wi: any) => wi.id);
      
      const detailsRes = await fetch(batchUrl, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${credentials}`,
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ids: topIds,
          $expand: "all"
        })
      });

      if (!detailsRes.ok) {
          throw new Error(`Azure DevOps Details Error: ${detailsRes.status}`);
      }

      const detailsData: any = await parseAzureJsonResponse(detailsRes, "Work items batch response");
      values = detailsData.value || [];
    }

    const stories = values.map((issue: any) => {
      let description = issue.fields["System.Description"] || issue.fields["Microsoft.VSTS.TCM.ReproSteps"] || "No description provided.";
      const ac = issue.fields["Microsoft.VSTS.Common.AcceptanceCriteria"];
      
      // Basic HTML to Markdown for ADO
      description = description.replace(/<[^>]+>/g, '\n').replace(/\n\s*\n/g, '\n\n').trim();
      
      if (ac) {
         const acText = ac.replace(/<[^>]+>/g, '\n').replace(/\n\s*\n/g, '\n\n').trim();
           description += `\n\n### ✅ Acceptance Criteria\n${acText}`;
      }

      return {
        id: String(issue.id),
        key: `AB#${issue.id}`,
        summary: issue.fields["System.Title"] || "No summary available",
        description: description,
        status: issue.fields["System.State"] || "Unknown"
      };
    });

    return NextResponse.json({ stories });

  } catch (error: any) {
    console.error("Azure DevOps API Error Catch:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
