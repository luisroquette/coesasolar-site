/**
 * SOFIA PIPELINE 2.0 - TOOLS DEFINITION
 * 
 * Define todas as ferramentas disponíveis para a LLM
 * Usando o padrão OpenAI Tool Calling
 */

import type { ToolName } from "./types.ts";

// ============================================
// TOOL SCHEMAS (OpenAI Function Calling Format)
// ============================================

export interface ToolSchema {
  type: "function";
  function: {
    name: ToolName;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}

export const PIPELINE_TOOLS: ToolSchema[] = [
  {
    type: "function",
    function: {
      name: "send_message",
      description: "Envia uma mensagem para o cliente via WhatsApp. Use sempre que precisar responder ao cliente.",
      parameters: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "O texto da mensagem a ser enviada. Máximo 4000 caracteres."
          },
          tone: {
            type: "string",
            enum: ["empathetic", "professional", "enthusiastic", "calm", "urgent"],
            description: "Tom da mensagem"
          },
          include_emoji: {
            type: "boolean",
            description: "Se deve incluir emojis na mensagem"
          }
        },
        required: ["text", "tone"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "save_fact",
      description: "Salva um fato importante sobre o cliente ou a conversa para memória persistente. Use para informações que precisam ser lembradas em futuras interações.",
      parameters: {
        type: "object",
        properties: {
          key: {
            type: "string",
            description: "Chave única do fato (ex: 'nome_cliente', 'valor_fatura', 'preferencia_contato')"
          },
          value: {
            type: "string",
            description: "Valor do fato"
          },
          fact_type: {
            type: "string",
            enum: ["fact", "preference", "commitment", "objection", "context"],
            description: "Tipo do fato sendo salvo"
          },
          confidence: {
            type: "number",
            description: "Nível de confiança no fato (0.0 a 1.0)"
          },
          valid_hours: {
            type: "number",
            description: "Por quantas horas esse fato é válido (null = permanente)"
          }
        },
        required: ["key", "value", "fact_type", "confidence"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "request_clarification",
      description: "Solicita esclarecimento ao cliente sobre uma informação ambígua ou incompleta.",
      parameters: {
        type: "object",
        properties: {
          about: {
            type: "string",
            description: "Sobre o que precisa de esclarecimento (ex: 'valor_fatura', 'distribuidora', 'tipo_instalacao')"
          },
          question: {
            type: "string",
            description: "A pergunta de esclarecimento a ser feita"
          },
          options: {
            type: "array",
            items: { type: "string" },
            description: "Opções sugeridas para o cliente escolher (opcional)"
          }
        },
        required: ["about", "question"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "escalate",
      description: "Escala a conversa para um atendente humano. Use em casos críticos ou quando o cliente solicita.",
      parameters: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            description: "Motivo da escalação"
          },
          urgency: {
            type: "string",
            enum: ["low", "medium", "high", "critical"],
            description: "Nível de urgência"
          },
          department: {
            type: "string",
            enum: ["sales", "support", "billing", "technical", "management"],
            description: "Departamento para onde escalar"
          },
          context_summary: {
            type: "string",
            description: "Resumo do contexto para o atendente"
          }
        },
        required: ["reason", "urgency", "department"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "collect_document",
      description: "Solicita um documento específico ao cliente.",
      parameters: {
        type: "object",
        properties: {
          document_type: {
            type: "string",
            enum: ["conta_energia", "rg_frente", "rg_verso", "cpf", "comprovante_endereco", "contrato_social", "procuracao"],
            description: "Tipo de documento a ser coletado"
          },
          instructions: {
            type: "string",
            description: "Instruções específicas para o cliente sobre como enviar o documento"
          },
          is_required: {
            type: "boolean",
            description: "Se o documento é obrigatório para prosseguir"
          }
        },
        required: ["document_type", "instructions"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "calculate_economy",
      description: "Calcula e apresenta a simulação de economia para o cliente.",
      parameters: {
        type: "object",
        properties: {
          valor_fatura: {
            type: "number",
            description: "Valor atual da fatura de energia em reais"
          },
          distribuidora: {
            type: "string",
            description: "Nome da distribuidora de energia"
          },
          consumo_kwh: {
            type: "number",
            description: "Consumo mensal em kWh (opcional, será calculado se não informado)"
          },
          show_detailed: {
            type: "boolean",
            description: "Se deve mostrar cálculo detalhado ou resumido"
          }
        },
        required: ["valor_fatura", "distribuidora"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "generate_proposal",
      description: "Gera uma proposta comercial para o cliente. Não use diretamente - apenas sinalize que é hora de gerar.",
      parameters: {
        type: "object",
        properties: {
          proposal_type: {
            type: "string",
            enum: ["initial", "definitive"],
            description: "Tipo de proposta a gerar"
          },
          plan_type: {
            type: "string",
            enum: ["flex", "economy", "premium", "unlock"],
            description: "Plano selecionado"
          },
          notes: {
            type: "string",
            description: "Notas adicionais para a proposta"
          }
        },
        required: ["proposal_type"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_crm",
      description: "Atualiza informações no CRM/Bitrix24. Use para sincronizar dados importantes.",
      parameters: {
        type: "object",
        properties: {
          field: {
            type: "string",
            description: "Campo a ser atualizado"
          },
          value: {
            type: "string",
            description: "Novo valor"
          },
          sync_immediately: {
            type: "boolean",
            description: "Se deve sincronizar imediatamente ou em batch"
          }
        },
        required: ["field", "value"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "schedule_followup",
      description: "Agenda um follow-up automático para a conversa.",
      parameters: {
        type: "object",
        properties: {
          delay_hours: {
            type: "number",
            description: "Em quantas horas fazer o follow-up"
          },
          message_type: {
            type: "string",
            enum: ["reminder", "nudge", "document_request", "proposal_followup", "contract_followup"],
            description: "Tipo de follow-up"
          },
          custom_message: {
            type: "string",
            description: "Mensagem customizada (opcional)"
          }
        },
        required: ["delay_hours", "message_type"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "send_proposal_link",
      description: "Envia o link da proposta para o cliente. Só use se a proposta já foi gerada.",
      parameters: {
        type: "object",
        properties: {
          include_qr_code: {
            type: "boolean",
            description: "Se deve incluir QR Code junto com o link"
          },
          message_prefix: {
            type: "string",
            description: "Texto a ser enviado antes do link"
          }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "mark_disqualified",
      description: "Marca o lead como desqualificado. Use quando o cliente não atende aos critérios.",
      parameters: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            enum: ["baixo_consumo", "grupo_a", "tarifa_social", "regiao_nao_atendida", "cliente_desistiu", "outro"],
            description: "Motivo da desqualificação"
          },
          details: {
            type: "string",
            description: "Detalhes adicionais"
          },
          send_farewell: {
            type: "boolean",
            description: "Se deve enviar mensagem de despedida"
          }
        },
        required: ["reason"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "transfer_to_sac",
      description: "Transfere a conversa para o SAC (marIA). Use quando identificar que é um cliente existente.",
      parameters: {
        type: "object",
        properties: {
          department: {
            type: "string",
            enum: ["billing", "technical", "contract", "general"],
            description: "Departamento do SAC"
          },
          context: {
            type: "string",
            description: "Contexto para a marIA"
          }
        },
        required: ["department"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "set_expected_field",
      description: "Define qual campo de dados deve ser coletado na próxima mensagem do cliente. SEMPRE use imediatamente após pedir nome, email, valor, distribuidora ou outros dados. Isso ativa o roteamento determinístico para respostas instantâneas.",
      parameters: {
        type: "object",
        properties: {
          field: {
            type: "string",
            enum: ["nome", "email", "valor", "distribuidora", "cpf", "cnpj", "telefone", "endereco"],
            description: "O tipo de dado que você acabou de pedir ao cliente"
          }
        },
        required: ["field"]
      }
    }
  }
];

// ============================================
// TOOL HELPERS
// ============================================

/**
 * Retorna apenas as ferramentas relevantes para o contexto atual
 */
export function getRelevantTools(
  funnelStage: string,
  hasProposal: boolean,
  isQualified: boolean
): ToolSchema[] {
  // CRITICAL: set_expected_field MUST be in base tools for FSM activation
  const baseTools = PIPELINE_TOOLS.filter(t => 
    ["send_message", "save_fact", "request_clarification", "escalate", "set_expected_field"].includes(t.function.name)
  );
  
  // Adiciona ferramentas baseadas no contexto
  const contextTools: ToolName[] = [];
  
  if (!hasProposal && isQualified) {
    contextTools.push("collect_document", "calculate_economy", "generate_proposal");
  }
  
  if (hasProposal) {
    contextTools.push("send_proposal_link", "schedule_followup");
  }
  
  if (!isQualified) {
    contextTools.push("mark_disqualified");
  }
  
  // Sempre disponíveis
  contextTools.push("update_crm", "transfer_to_sac");
  
  console.log(`[Tools] Base tools: ${baseTools.map(t => t.function.name).join(', ')}`);
  console.log(`[Tools] Context tools for stage ${funnelStage}: ${contextTools.join(', ')}`);
  
  return [
    ...baseTools,
    ...PIPELINE_TOOLS.filter(t => contextTools.includes(t.function.name as ToolName))
  ];
}

/**
 * Valida os parâmetros de uma tool call
 */
export function validateToolCall(
  toolName: string,
  parameters: Record<string, unknown>
): { valid: boolean; error?: string } {
  const tool = PIPELINE_TOOLS.find(t => t.function.name === toolName);
  
  if (!tool) {
    return { valid: false, error: `Tool '${toolName}' not found` };
  }
  
  const required = tool.function.parameters.required;
  for (const param of required) {
    if (!(param in parameters)) {
      return { valid: false, error: `Missing required parameter: ${param}` };
    }
  }
  
  return { valid: true };
}

/**
 * Formata as ferramentas para o prompt da LLM
 */
export function formatToolsForPrompt(tools: ToolSchema[]): string {
  return tools.map(t => {
    const params = Object.entries(t.function.parameters.properties)
      .map(([name, schema]) => {
        const s = schema as { type: string; description?: string };
        return `  - ${name} (${s.type}): ${s.description || ''}`;
      })
      .join('\n');
    
    return `### ${t.function.name}\n${t.function.description}\nParâmetros:\n${params}`;
  }).join('\n\n');
}
