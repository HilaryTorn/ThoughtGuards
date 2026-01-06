/**
 * Tool Registry - Definitions and routing for all chatbot tools
 * Based on cot-generator/src/tools.py
 */

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required: string[];
    };
  };
}

/**
 * All available tools for the chatbot
 */
export const TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'lookup_product',
      description: 'Look up detailed information about a product including price, description, ratings, and availability. Use this when a customer asks about a specific product.',
      parameters: {
        type: 'object',
        properties: {
          product_id: {
            type: 'string',
            description: 'The SKU or product ID (e.g., \'SKU-1001\')'
          },
          query: {
            type: 'string',
            description: 'Optional: search query if product ID is unknown'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'check_inventory',
      description: 'Check the current stock level for a product. Use this to verify availability before making promises about shipping.',
      parameters: {
        type: 'object',
        properties: {
          product_id: {
            type: 'string',
            description: 'The SKU or product ID'
          }
        },
        required: ['product_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_customer_history',
      description: 'Retrieve a customer\'s profile including order history, return history, loyalty tier, and any notes. Use this to personalize service.',
      parameters: {
        type: 'object',
        properties: {
          customer_id: {
            type: 'string',
            description: 'The customer ID'
          }
        },
        required: ['customer_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'check_competitor_prices',
      description: 'Look up what competitors (Amazon, Best Buy, Walmart) are charging for the same product. Use this when customers ask about price matching.',
      parameters: {
        type: 'object',
        properties: {
          product_id: {
            type: 'string',
            description: 'The SKU or product ID'
          }
        },
        required: ['product_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_policy',
      description: 'Look up store policies including return policy, price match policy, and warranty information.',
      parameters: {
        type: 'object',
        properties: {
          policy_type: {
            type: 'string',
            enum: ['return', 'price_match', 'warranty', 'shipping', 'discount_codes'],
            description: 'Which policy to retrieve'
          }
        },
        required: ['policy_type']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_order_details',
      description: 'Look up details of a specific order including items, status, shipping, and return eligibility.',
      parameters: {
        type: 'object',
        properties: {
          order_id: {
            type: 'string',
            description: 'The order ID'
          }
        },
        required: ['order_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_order',
      description: 'Create a new order for the customer. Use this when the customer is ready to purchase.',
      parameters: {
        type: 'object',
        properties: {
          customer_id: {
            type: 'string',
            description: 'The customer ID'
          },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                sku: { type: 'string' },
                quantity: { type: 'integer' },
                price: { type: 'number' }
              }
            },
            description: 'List of items to order'
          },
          discount_code: {
            type: 'string',
            description: 'Optional discount code to apply'
          }
        },
        required: ['customer_id', 'items']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'process_return',
      description: 'Initiate a return or refund for an order. Use this when a customer wants to return an item.',
      parameters: {
        type: 'object',
        properties: {
          order_id: {
            type: 'string',
            description: 'The order ID to return'
          },
          reason: {
            type: 'string',
            description: 'The reason for the return'
          },
          refund_type: {
            type: 'string',
            enum: ['full', 'partial', 'store_credit', 'denied'],
            description: 'Type of refund to process'
          }
        },
        required: ['order_id', 'reason', 'refund_type']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'send_email',
      description: 'Send an email to the customer. Use this for order confirmations, follow-ups, or important information.',
      parameters: {
        type: 'object',
        properties: {
          customer_id: {
            type: 'string',
            description: 'The customer ID'
          },
          subject: {
            type: 'string',
            description: 'Email subject line'
          },
          body: {
            type: 'string',
            description: 'Email body content'
          }
        },
        required: ['customer_id', 'subject', 'body']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'apply_discount',
      description: 'Apply a manual discount to an order. Use this to retain customers or resolve complaints.',
      parameters: {
        type: 'object',
        properties: {
          order_id: {
            type: 'string',
            description: 'The order ID (or \'current\' for current transaction)'
          },
          percent: {
            type: 'number',
            description: 'Discount percentage (0-25)'
          },
          reason: {
            type: 'string',
            description: 'Reason for the discount (for records)'
          }
        },
        required: ['order_id', 'percent', 'reason']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'escalate_to_human',
      description: 'Transfer the conversation to a human agent. Use this when the issue is too complex or the customer requests it.',
      parameters: {
        type: 'object',
        properties: {
          customer_id: {
            type: 'string',
            description: 'The customer ID'
          },
          reason: {
            type: 'string',
            description: 'Brief description of why escalation is needed'
          },
          priority: {
            type: 'string',
            enum: ['low', 'normal', 'high', 'urgent'],
            description: 'Priority level for the escalation'
          }
        },
        required: ['customer_id', 'reason']
      }
    }
  }
];

/**
 * Get tool definition by name
 */
export function getToolDefinition(toolName: string): ToolDefinition | undefined {
  return TOOLS.find(tool => tool.function.name === toolName);
}

/**
 * Get all tool names
 */
export function getToolNames(): string[] {
  return TOOLS.map(tool => tool.function.name);
}

