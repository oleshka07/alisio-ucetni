import type { ChatCompletionTool } from "openai/resources/chat/completions";

export const AI_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_clients",
      description: "Search for clients by name, type, IČO, or other criteria. Returns a list of matching clients with basic info.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search term (name, IČO, company name, etc.)",
          },
          type: {
            type: "string",
            enum: ["company", "person"],
            description: "Filter by client type",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_client_details",
      description: "Get full details about a specific client including all profiles (company, employee, tax, insurance), their tasks and documents.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string", description: "The client ID" },
          clientName: { type: "string", description: "Client name to search for if ID is not known" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_client",
      description: "Create a new client with basic info and optional profile data.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Client display name" },
          type: { type: "string", enum: ["company", "person"], description: "Client type" },
          role: { type: "string", enum: ["owner", "director", "employee"], description: "Client role" },
          company: {
            type: "object",
            description: "Company profile data",
            properties: {
              companyName: { type: "string" }, ico: { type: "string" }, dic: { type: "string" },
              street: { type: "string" }, city: { type: "string" }, zip: { type: "string" },
              country: { type: "string" }, contactPerson: { type: "string" },
              phone: { type: "string" }, email: { type: "string" }, dataBox: { type: "string" },
              bankAccount: { type: "string" }, bankCode: { type: "string" }, iban: { type: "string" },
              vatPayer: { type: "boolean" }, vatPeriod: { type: "string" },
              registrationDate: { type: "string" }, legalForm: { type: "string" },
              businessActivity: { type: "string" },
            },
          },
          employee: {
            type: "object",
            description: "Personal/employee profile data",
            properties: {
              firstName: { type: "string" }, lastName: { type: "string" },
              birthDate: { type: "string" }, birthPlace: { type: "string" },
              birthNumber: { type: "string" }, nationality: { type: "string" },
              citizenship: { type: "string" }, idCardNumber: { type: "string" },
              gender: { type: "string", enum: ["M", "F"] },
              permStreet: { type: "string" }, permCity: { type: "string" },
              permZip: { type: "string" }, permCountry: { type: "string" },
              phone: { type: "string" }, email: { type: "string" },
              bankAccount: { type: "string" }, education: { type: "string" },
            },
          },
        },
        required: ["name", "type", "role"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_client",
      description: "Update specific fields of an existing client's profiles.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string", description: "Client ID to update" },
          basic: { type: "object", properties: { name: { type: "string" }, type: { type: "string" }, role: { type: "string" } } },
          company: { type: "object", description: "Company profile fields to update", additionalProperties: true },
          employee: { type: "object", description: "Employee profile fields to update", additionalProperties: true },
          tax: { type: "object", description: "Tax profile fields to update", additionalProperties: true },
          insurance: { type: "object", description: "Insurance profile fields to update", additionalProperties: true },
        },
        required: ["clientId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_tasks",
      description: "Search tasks by status, client, or keyword.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string", description: "Filter by client ID" },
          clientName: { type: "string", description: "Filter by client name" },
          status: { type: "string", enum: ["pending", "in_progress", "done", "cancelled"] },
          query: { type: "string", description: "Search in title/description" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Create a new task for a client.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string", description: "Client ID" },
          clientName: { type: "string", description: "Client name (if ID unknown)" },
          title: { type: "string", description: "Task title" },
          description: { type: "string", description: "Task description" },
          priority: { type: "string", enum: ["low", "normal", "high"] },
          dueDate: { type: "string", description: "Due date YYYY-MM-DD" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_documents",
      description: "List documents for a specific client.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" },
          clientName: { type: "string" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_document_to_client",
      description: "Save an uploaded file as a document for a specific client.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string", description: "Client ID to attach document to" },
          clientName: { type: "string", description: "Client name if ID unknown" },
          description: { type: "string", description: "Document description" },
          taskTitle: { type: "string", description: "Optional task title to create" },
        },
        required: [],
      },
    },
  },
];
