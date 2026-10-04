/** Foundation masters over REST (Slice 0): parties, items, and the lookups their forms need. */
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { ItemService, PartyService, TaxService, UomService } from "@master-erp/foundation";
import type { ItemInput, PartyInput } from "@master-erp/foundation";
import { Api, etag, expectedVersion, IdParams, ListQuery, Page, TenantApi } from "./api.ts";
import type { ApiRequest } from "./api.ts";
import { SessionGuard } from "./session.guard.ts";

const Ext = Type.Record(Type.String(), Type.Unknown(), { description: "Extension fields defined by the tenant's packages (GET /api/v1/fields/{objectType})" });
const Status = Type.Union([Type.Literal("active"), Type.Literal("blocked"), Type.Literal("archived")]);

const PartyBody = Type.Object(
  {
    code: Type.Optional(Type.String({ maxLength: 30 })),
    name: Type.String({ minLength: 1, maxLength: 200 }),
    legalName: Type.Optional(Type.String({ maxLength: 200 })),
    kind: Type.Optional(Type.Union([Type.Literal("organisation"), Type.Literal("individual")])),
    roles: Type.Array(Type.Union([Type.Literal("customer"), Type.Literal("vendor"), Type.Literal("transporter"), Type.Literal("job_worker")]), { maxItems: 4 }),
    defaultCurrency: Type.Optional(Type.String({ pattern: "^[A-Z]{3}$" })),
    taxIds: Type.Optional(Type.Array(Type.Object({ scheme: Type.String(), value: Type.String({ maxLength: 40 }), addressKey: Type.Optional(Type.String()), isPrimary: Type.Optional(Type.Boolean()) }, { additionalProperties: false }), { maxItems: 50 })),
    addresses: Type.Optional(Type.Array(Type.Object({
      key: Type.Optional(Type.String()),
      kind: Type.Union([Type.Literal("registered"), Type.Literal("billing"), Type.Literal("shipping"), Type.Literal("works")]),
      label: Type.Optional(Type.String({ maxLength: 60 })),
      line1: Type.String({ maxLength: 200 }), line2: Type.Optional(Type.String({ maxLength: 200 })),
      city: Type.String({ maxLength: 100 }), district: Type.Optional(Type.String({ maxLength: 100 })),
      regionCode: Type.String({ description: "ISO 3166-2, e.g. IN-MH" }), postalCode: Type.Optional(Type.String({ maxLength: 12 })),
      country: Type.Optional(Type.String({ pattern: "^[A-Z]{2}$" })), isDefault: Type.Optional(Type.Boolean()),
    }, { additionalProperties: false }), { maxItems: 50 })),
    contacts: Type.Optional(Type.Array(Type.Object({
      name: Type.String({ maxLength: 100 }), designation: Type.Optional(Type.String({ maxLength: 100 })),
      phone: Type.Optional(Type.String({ maxLength: 30 })), email: Type.Optional(Type.String({ maxLength: 200 })), isPrimary: Type.Optional(Type.Boolean()),
    }, { additionalProperties: false }), { maxItems: 50 })),
    ext: Type.Optional(Ext),
  },
  { additionalProperties: false },
);

const PartySummary = Type.Object({ id: Type.String(), code: Type.String(), name: Type.String(), status: Status, roles: Type.Array(Type.String()), gstins: Type.Array(Type.String()), city: Type.Union([Type.String(), Type.Null()]) });
const PartyQuery = Type.Composite([ListQuery, Type.Object({ "filter[role]": Type.Optional(Type.String()), "filter[status]": Type.Optional(Status) })]);

const ItemBody = Type.Object(
  {
    code: Type.Optional(Type.String({ maxLength: 40 })),
    name: Type.String({ minLength: 1, maxLength: 200 }),
    description: Type.Optional(Type.String({ maxLength: 2000 })),
    category: Type.String({ description: "Category code" }),
    itemType: Type.Optional(Type.Union([Type.Literal("stock"), Type.Literal("non_stock"), Type.Literal("service")])),
    baseUom: Type.Optional(Type.String()),
    hsnSac: Type.Optional(Type.String({ maxLength: 8 })),
    taxCategory: Type.Optional(Type.String()),
    ownerPartyId: Type.Optional(Type.String({ pattern: "^[0-9a-f-]{36}$" })),
    ext: Type.Optional(Ext),
    conversions: Type.Optional(Type.Array(Type.Object({ from: Type.String(), to: Type.String(), factor: Type.String({ pattern: "^[0-9]+(\\.[0-9]+)?$" }) }, { additionalProperties: false }), { maxItems: 20 })),
  },
  { additionalProperties: false },
);
const ItemSummary = Type.Object({ id: Type.String(), code: Type.String(), name: Type.String(), category: Type.String(), baseUom: Type.String(), hsnSac: Type.Union([Type.String(), Type.Null()]), status: Status });
const ItemQuery = Type.Composite([ListQuery, Type.Object({ "filter[category]": Type.Optional(Type.String()), "filter[status]": Type.Optional(Status) })]);
const Action = Type.Object({ id: IdParams.properties.id, action: Type.Union([Type.Literal("block"), Type.Literal("unblock"), Type.Literal("archive")]) }, { additionalProperties: false });
const STATUS_AFTER = { block: "blocked", unblock: "active", archive: "archived" } as const;

type Q = Static<typeof ListQuery> & Record<string, string | undefined>;
const listArgs = (q: Q) => ({ ...(q.search ? { search: q.search } : {}), ...(q.limit ? { limit: q.limit } : {}), ...(q.cursor ? { cursor: q.cursor } : {}) });

@Controller("api/v1/parties")
@UseGuards(SessionGuard)
export class PartiesController {
  constructor(@Inject(TenantApi) private readonly api: TenantApi) {}

  @Get()
  @Api({ summary: "List parties", tags: ["Parties"], permission: "foundation.party.read", query: PartyQuery, response: Page(PartySummary) })
  list(@Req() req: ApiRequest, @Query() q: Q) {
    return this.api.run(req, (s) =>
      new PartyService({ rules: s.rules, config: s.config }).list(s.tx, {
        ...listArgs(q),
        ...(q["filter[role]"] ? { role: q["filter[role]"] as PartyInput["roles"][number] } : {}),
        ...(q["filter[status]"] ? { status: q["filter[status]"] as Static<typeof Status> } : {}),
      }),
    );
  }

  @Post()
  @Api({ summary: "Create a party", tags: ["Parties"], permission: "foundation.party.create", body: PartyBody })
  async create(@Req() req: ApiRequest, @Body() body: PartyInput, @Res({ passthrough: true }) reply: FastifyReply) {
    const party = await this.api.run(req, (s) => new PartyService({ rules: s.rules, config: s.config }).create(s.tx, body));
    void reply.header("etag", etag(party.version)).header("location", `/api/v1/parties/${party.id}`);
    return party;
  }

  @Get(":id")
  @Api({ summary: "Get a party", tags: ["Parties"], permission: "foundation.party.read", params: IdParams })
  async get(@Req() req: ApiRequest, @Param("id") id: string, @Res({ passthrough: true }) reply: FastifyReply) {
    const party = await this.api.run(req, (s) => new PartyService({ rules: s.rules, config: s.config }).get(s.tx, id));
    void reply.header("etag", etag(party.version));
    return party;
  }

  @Put(":id")
  @Api({ summary: "Replace a party (needs If-Match)", tags: ["Parties"], permission: "foundation.party.update", params: IdParams, body: PartyBody })
  async replace(@Req() req: ApiRequest, @Param("id") id: string, @Body() body: PartyInput, @Res({ passthrough: true }) reply: FastifyReply) {
    const version = expectedVersion(req);
    const party = await this.api.run(req, (s) => new PartyService({ rules: s.rules, config: s.config }).update(s.tx, id, version, body));
    void reply.header("etag", etag(party.version));
    return party;
  }

  @Post(":id/actions/:action")
  @HttpCode(200)
  @Api({ summary: "Block, unblock or archive a party", tags: ["Parties"], permission: "foundation.party.update", params: Action })
  async action(@Req() req: ApiRequest, @Param("id") id: string, @Param("action") action: keyof typeof STATUS_AFTER) {
    return this.api.run(req, async (s) => {
      const svc = new PartyService({ rules: s.rules, config: s.config });
      await svc.setStatus(s.tx, id, STATUS_AFTER[action]);
      return svc.get(s.tx, id);
    });
  }
}

@Controller("api/v1/items")
@UseGuards(SessionGuard)
export class ItemsController {
  constructor(@Inject(TenantApi) private readonly api: TenantApi) {}

  @Get()
  @Api({ summary: "List items", tags: ["Items"], permission: "foundation.item.read", query: ItemQuery, response: Page(ItemSummary) })
  list(@Req() req: ApiRequest, @Query() q: Q) {
    return this.api.run(req, (s) =>
      new ItemService({ rules: s.rules, config: s.config }).list(s.tx, {
        ...listArgs(q),
        ...(q["filter[category]"] ? { category: q["filter[category]"] } : {}),
        ...(q["filter[status]"] ? { status: q["filter[status]"] as Static<typeof Status> } : {}),
      }),
    );
  }

  @Post()
  @Api({ summary: "Create an item", tags: ["Items"], permission: "foundation.item.create", body: ItemBody })
  async create(@Req() req: ApiRequest, @Body() body: ItemInput, @Res({ passthrough: true }) reply: FastifyReply) {
    const item = await this.api.run(req, (s) => new ItemService({ rules: s.rules, config: s.config }).create(s.tx, s.prepareItem(body)));
    void reply.header("etag", etag(item.version)).header("location", `/api/v1/items/${item.id}`);
    return item;
  }

  @Get(":id")
  @Api({ summary: "Get an item (with computed fields and unit conversions)", tags: ["Items"], permission: "foundation.item.read", params: IdParams })
  async get(@Req() req: ApiRequest, @Param("id") id: string, @Res({ passthrough: true }) reply: FastifyReply) {
    const item = await this.api.run(req, (s) => new ItemService({ rules: s.rules, config: s.config }).get(s.tx, id));
    void reply.header("etag", etag(item.version));
    return item;
  }

  @Put(":id")
  @Api({ summary: "Replace an item (needs If-Match)", tags: ["Items"], permission: "foundation.item.update", params: IdParams, body: ItemBody })
  async replace(@Req() req: ApiRequest, @Param("id") id: string, @Body() body: ItemInput, @Res({ passthrough: true }) reply: FastifyReply) {
    const version = expectedVersion(req);
    const item = await this.api.run(req, (s) => new ItemService({ rules: s.rules, config: s.config }).update(s.tx, id, version, s.prepareItem(body)));
    void reply.header("etag", etag(item.version));
    return item;
  }

  @Post(":id/actions/:action")
  @HttpCode(200)
  @Api({ summary: "Block, unblock or archive an item", tags: ["Items"], permission: "foundation.item.update", params: Action })
  async action(@Req() req: ApiRequest, @Param("id") id: string, @Param("action") action: keyof typeof STATUS_AFTER) {
    return this.api.run(req, async (s) => {
      const svc = new ItemService({ rules: s.rules, config: s.config });
      await svc.setStatus(s.tx, id, STATUS_AFTER[action]);
      return svc.get(s.tx, id);
    });
  }
}

const ObjectTypeParams = Type.Object({ objectType: Type.Union([Type.Literal("foundation.party"), Type.Literal("foundation.item")]) }, { additionalProperties: false });
const FieldsQuery = Type.Object({
  lang: Type.Optional(Type.String({ pattern: "^[a-z]{2}(-[A-Z]{2})?$" })),
  category: Type.Optional(Type.String({ maxLength: 30, description: "Only the fields that apply to this category" })),
  item_type: Type.Optional(Type.String({ maxLength: 20 })),
});

/** Read-only lookups for forms (any member who can read items or parties). */
@Controller("api/v1")
@UseGuards(SessionGuard)
export class LookupsController {
  constructor(@Inject(TenantApi) private readonly api: TenantApi) {}

  @Get("uoms")
  @Api({ summary: "Units of measure", tags: ["Lookups"], permission: "foundation.item.read" })
  uoms(@Req() req: ApiRequest) {
    return this.api.run(req, (s) => new UomService().list(s.tx));
  }

  @Get("item-categories")
  @Api({ summary: "Item categories with their defaults", tags: ["Lookups"], permission: "foundation.item.read" })
  categories(@Req() req: ApiRequest) {
    return this.api.run(req, (s) => new ItemService({ config: s.config }).listCategories(s.tx));
  }

  @Get("tax-categories")
  @Api({ summary: "Tax categories with effective-dated rates", tags: ["Lookups"], permission: "foundation.item.read" })
  taxCategories(@Req() req: ApiRequest) {
    return this.api.run(req, (s) => new TaxService().list(s.tx));
  }

  @Get("fields/:objectType")
  @Api({ summary: "Extension fields of an object type, for building forms", tags: ["Lookups"], params: ObjectTypeParams, query: FieldsQuery })
  fields(@Req() req: ApiRequest, @Param("objectType") objectType: string, @Query() q: { lang?: string; category?: string; item_type?: string }) {
    const lang = q.lang ?? "en";
    return this.api.run(req, async (s) => {
      const validator = s.config.validator(objectType);
      const facts = { ...(q.category ? { category: q.category } : {}), ...(q.item_type ? { item_type: q.item_type } : {}) };
      const defs = q.category || q.item_type ? validator.applicable(facts) : s.config.fields(objectType).map((f) => ({ ...f, requiredNow: f.required === true }));
      return defs.map((f) => ({ ...f, label: f.label[lang] ?? f.label.en ?? f.key }));
    });
  }
}
