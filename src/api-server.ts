/**
 * REST API Server for Discogs MCP
 *
 * Exposes ALL MCP tools via REST API so the gateway can:
 * 1. GET /api/tools - Discover available tools
 * 2. POST /api/tools/:name - Execute a specific tool
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { config } from './config.js';
import { log } from './utils.js';
import { VERSION } from './version.js';

// Import all tools
import {
  searchTool,
  getArtistTool,
  getArtistReleasesTool,
  getReleaseTool,
  getMasterReleaseTool,
  getMasterReleaseVersionsTool,
  getLabelTool,
  getLabelReleasesTool,
  getReleaseRatingTool,
  editReleaseRatingTool,
  deleteReleaseRatingTool,
  getReleaseCommunityRatingTool,
} from './tools/database.js';

import {
  getUserInventoryTool,
  getMarketplaceListingTool,
  createMarketplaceListingTool,
  updateMarketplaceListingTool,
  deleteMarketplaceListingTool,
  getMarketplaceOrderTool,
  editMarketplaceOrderTool,
  getMarketplaceOrdersTool,
  getMarketplaceOrderMessagesTool,
  createMarketplaceOrderMessageTool,
  getMarketplaceReleaseStatsTool,
} from './tools/marketplace.js';

import {
  getUserCollectionFoldersTool,
  createUserCollectionFolderTool,
  getUserCollectionFolderTool,
  editUserCollectionFolderTool,
  deleteUserCollectionFolderTool,
  findReleaseInUserCollectionTool,
  getUserCollectionItemsTool,
  addReleaseToUserCollectionFolderTool,
  rateReleaseInUserCollectionTool,
  moveReleaseInUserCollectionTool,
  deleteReleaseFromUserCollectionFolderTool,
  getUserCollectionCustomFieldsTool,
  editUserCollectionCustomFieldValueTool,
  getUserCollectionValueTool,
} from './tools/userCollection.js';

import {
  getUserIdentityTool,
  getUserProfileTool,
  editUserProfileTool,
  getUserSubmissionsTool,
  getUserContributionsTool,
} from './tools/userIdentity.js';

import {
  getUserWantlistTool,
  addToWantlistTool,
  editItemInWantlistTool,
  deleteItemInWantlistTool,
} from './tools/userWantlist.js';

import {
  getUserListsTool,
  getListTool,
} from './tools/userLists.js';

import {
  inventoryExportTool,
  getInventoryExportsTool,
  getInventoryExportTool,
  downloadInventoryExportTool,
} from './tools/inventoryExport.js';

import { fetchImageTool } from './tools/media.js';

const app = express();
app.use(cors());
app.use(express.json());

// Collect all tools into a single array
const ALL_TOOLS = [
  // Database tools (12)
  searchTool,
  getArtistTool,
  getArtistReleasesTool,
  getReleaseTool,
  getMasterReleaseTool,
  getMasterReleaseVersionsTool,
  getLabelTool,
  getLabelReleasesTool,
  getReleaseRatingTool,
  editReleaseRatingTool,
  deleteReleaseRatingTool,
  getReleaseCommunityRatingTool,

  // Marketplace tools (11)
  getUserInventoryTool,
  getMarketplaceListingTool,
  createMarketplaceListingTool,
  updateMarketplaceListingTool,
  deleteMarketplaceListingTool,
  getMarketplaceOrderTool,
  editMarketplaceOrderTool,
  getMarketplaceOrdersTool,
  getMarketplaceOrderMessagesTool,
  createMarketplaceOrderMessageTool,
  getMarketplaceReleaseStatsTool,

  // User Collection tools (14)
  getUserCollectionFoldersTool,
  createUserCollectionFolderTool,
  getUserCollectionFolderTool,
  editUserCollectionFolderTool,
  deleteUserCollectionFolderTool,
  findReleaseInUserCollectionTool,
  getUserCollectionItemsTool,
  addReleaseToUserCollectionFolderTool,
  rateReleaseInUserCollectionTool,
  moveReleaseInUserCollectionTool,
  deleteReleaseFromUserCollectionFolderTool,
  getUserCollectionCustomFieldsTool,
  editUserCollectionCustomFieldValueTool,
  getUserCollectionValueTool,

  // User Identity tools (5)
  getUserIdentityTool,
  getUserProfileTool,
  editUserProfileTool,
  getUserSubmissionsTool,
  getUserContributionsTool,

  // User Wantlist tools (4)
  getUserWantlistTool,
  addToWantlistTool,
  editItemInWantlistTool,
  deleteItemInWantlistTool,

  // User Lists tools (2)
  getUserListsTool,
  getListTool,

  // Inventory Export tools (4)
  inventoryExportTool,
  getInventoryExportsTool,
  getInventoryExportTool,
  downloadInventoryExportTool,

  // Media tools (1)
  fetchImageTool,
];

// Create a map for quick tool lookup by name
const TOOLS_MAP = new Map(ALL_TOOLS.map(tool => [tool.name, tool]));

// Format tools for API response
const formatToolsForApi = () => {
  return ALL_TOOLS.map(tool => {
    // Extract parameter info from Zod schema
    const schema = tool.parameters;
    let parameters: Record<string, any> = {};

    if (schema && 'shape' in schema) {
      const shape = (schema as any).shape;
      for (const [key, value] of Object.entries(shape)) {
        const zodType = value as any;
        parameters[key] = {
          type: zodType._def?.typeName?.replace('Zod', '').toLowerCase() || 'unknown',
          required: !zodType.isOptional?.(),
          description: zodType._def?.description || '',
        };
      }
    }

    return {
      name: tool.name,
      description: tool.description,
      parameters,
    };
  });
};

// ============================================
// ROUTES
// ============================================

/**
 * Health check
 */
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'discogs-mcp',
    version: VERSION,
    toolsCount: ALL_TOOLS.length,
  });
});

/**
 * GET /api/tools - List all available tools
 * This is the "discovery" endpoint for the model
 */
app.get('/api/tools', (_req: Request, res: Response) => {
  res.json({
    service: 'discogs-mcp',
    version: VERSION,
    description: 'Discogs Music Database API - Fornisce conoscenza musicale su artisti, album, label, release, marketplace, collection, wantlist.',
    toolsCount: ALL_TOOLS.length,
    tools: formatToolsForApi(),
    usage: {
      endpoint: 'POST /api/tools/:toolName',
      example: {
        url: '/api/tools/search',
        body: { q: 'Pink Floyd', type: 'artist' },
      },
    },
  });
});

/**
 * POST /api/tools/:name - Execute a tool
 */
app.post('/api/tools/:name', async (req: Request, res: Response, next: NextFunction) => {
  const { name } = req.params;
  const params = req.body;

  log.info(`[API] Executing tool: ${name}`, params);

  try {
    const tool = TOOLS_MAP.get(name);

    if (!tool) {
      res.status(404).json({
        error: `Tool '${name}' not found`,
        available: Array.from(TOOLS_MAP.keys()),
      });
      return;
    }

    // Execute the tool
    const result = await tool.execute(params, {} as any);

    // Parse result if it's a JSON string
    let parsedResult = result;
    if (typeof result === 'string') {
      try {
        parsedResult = JSON.parse(result);
      } catch {
        // Keep as string if not valid JSON
      }
    }

    res.json({ success: true, tool: name, result: parsedResult });
  } catch (error: any) {
    log.error(`[API] Tool ${name} failed:`, error);
    next(error);
  }
});

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  log.error('[API] Error:', err);
  res.status(500).json({
    error: err.message || 'Internal server error',
    tool: _req.params?.name,
  });
});

// ============================================
// START SERVER
// ============================================

const PORT = config.server.port || 3002;
const HOST = config.server.host || '0.0.0.0';

app.listen(PORT, HOST, () => {
  log.info(`=============================================`);
  log.info(`Discogs MCP REST API Server v${VERSION}`);
  log.info(`=============================================`);
  log.info(`Listening on http://${HOST}:${PORT}`);
  log.info(`Health check: GET http://${HOST}:${PORT}/health`);
  log.info(`Tools endpoint: GET http://${HOST}:${PORT}/api/tools`);
  log.info(`Execute tool: POST http://${HOST}:${PORT}/api/tools/:name`);
  log.info(`---------------------------------------------`);
  log.info(`Available Tools (${ALL_TOOLS.length}):`);

  // Group tools by category
  const categories = [
    { name: 'Database', tools: ['search', 'get_artist', 'get_artist_releases', 'get_release', 'get_master_release', 'get_master_release_versions', 'get_label', 'get_label_releases', 'get_release_rating_by_user', 'edit_release_rating', 'delete_release_rating', 'get_release_community_rating'] },
    { name: 'Marketplace', tools: ['get_user_inventory', 'get_marketplace_listing', 'create_marketplace_listing', 'update_marketplace_listing', 'delete_marketplace_listing', 'get_marketplace_order', 'edit_marketplace_order', 'get_marketplace_orders', 'get_marketplace_order_messages', 'create_marketplace_order_message', 'get_marketplace_release_stats'] },
    { name: 'User Collection', tools: ['get_user_collection_folders', 'create_user_collection_folder', 'get_user_collection_folder', 'edit_user_collection_folder', 'delete_user_collection_folder', 'find_release_in_user_collection', 'get_user_collection_items', 'add_release_to_user_collection_folder', 'rate_release_in_user_collection', 'move_release_in_user_collection', 'delete_release_from_user_collection_folder', 'get_user_collection_custom_fields', 'edit_user_collection_custom_field_value', 'get_user_collection_value'] },
    { name: 'User Identity', tools: ['get_user_identity', 'get_user_profile', 'edit_user_profile', 'get_user_submissions', 'get_user_contributions'] },
    { name: 'User Wantlist', tools: ['get_user_wantlist', 'add_to_wantlist', 'edit_item_in_wantlist', 'delete_item_in_wantlist'] },
    { name: 'User Lists', tools: ['get_user_lists', 'get_list'] },
    { name: 'Inventory Export', tools: ['inventory_export', 'get_inventory_exports', 'get_inventory_export', 'download_inventory_export'] },
    { name: 'Media', tools: ['fetch_image'] },
  ];

  categories.forEach(category => {
    log.info(`  [${category.name}] (${category.tools.length})`);
    category.tools.forEach(toolName => {
      const tool = TOOLS_MAP.get(toolName);
      if (tool) {
        log.info(`    - ${tool.name}: ${tool.description}`);
      }
    });
  });

  log.info(`=============================================`);
});
