// Authorization: the one module every item feature goes through (DESIGN §3).
export {
  APP_ACTIONS,
  type AppAction,
  can,
  type ExportScope,
  exportItemsWhere,
  exportScope,
  requireCan,
} from "./actions";
export type { AuthCtx, Role } from "./ctx";
export {
  atLeast,
  canSeeMoney,
  type GrantRef,
  grantLevel,
  grantLevelsAtLeast,
  type ItemAuthFields,
  isVisible,
  itemLevel,
  LEVELS,
  type Level,
  levelRank,
  maxLevel,
  minLevel,
  ownsItem,
  ROLE_CEILING,
  type VisibleLevel,
} from "./levels";
export {
  itemLevels,
  type LeveledItem,
  loadItemForCtx,
  requireItemForCtx,
  withLevels,
} from "./load";
export {
  type ItemsTableLike,
  itemsAtLeastWhere,
  moneyVisibleWhere,
  visibleItemsWhere,
} from "./predicates";
export {
  type Checked,
  type Owner,
  type OwnerInput,
  type PrincipalError,
  type PrincipalInput,
  validateGrantPrincipal,
  validateOwner,
} from "./principals";
export {
  canReadAttachment,
  filterAttachments,
  loadAttachmentForCtx,
  type ReadableAttachment,
  type SerializedAttachment,
  type SerializedItem,
  serializeItem,
  serializeItemsForCtx,
  serializeLeveled,
} from "./serialize";
