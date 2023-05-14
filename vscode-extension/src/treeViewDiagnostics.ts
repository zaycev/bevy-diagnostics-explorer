import * as vscode from "vscode";
import exp = require("constants");

interface Duration {
  secs: number;
  nanos: number;
}

export interface Span {
  id: number;
  parentId: number;
  name: string;
  scope: string;
  duration: Duration;
}

export interface EcsRootProps {}

export interface EcsSpanScopeProps {
  name: string;
  collapsedDuration: Duration;
  totalCount: number;
}

export interface EcsSpanDiagnosticProps {
  key: string;
  name: string;
  scope: string;
  duration: Duration;
  count: number;
}

export enum NodeKind {
  ECS_ROOT = 1,
  ECS_SPAN_SCOPE = 2,
  ECS_SPAN_DIAGNOSTIC = 3,
  RENDER_GRAPH_ROOT = 101,
  RENDER_GRAPH_DIAGNOSTIC = 102,
}

export const addDuration = (a: Duration, b: Duration): Duration => {
  let nanos = a.nanos + b.nanos;
  let secs = a.secs + b.secs + Math.floor(nanos / 1e9);
  if (nanos >= 1e9) {
    secs += 1;
    nanos -= 1e9;
  }
  return { secs, nanos };
};

export const divideDuration = (d: Duration, f: number): Duration => {
  let totalNanos = d.secs * 1e9 + d.nanos;
  totalNanos /= f;
  const secs = Math.floor(totalNanos / 1e9);
  const nanos = totalNanos % 1e9;
  return { secs, nanos };
};

/**
 * Format duration as a string.
 */
const formatDuration = (d: Duration, count: number | undefined): string => {
  let durationMs = d.secs * 1e3 + d.nanos / 1e6;
  let durationNs = d.secs * 1e9 + d.nanos;
  if (count !== undefined) {
    durationMs /= count;
    durationNs /= count;
  }
  return durationMs <= 0.01
    ? `${durationNs.toFixed(2)}ns`
    : `${durationMs.toFixed(2)}ms`;
};

type NodeProps =
  | EcsRootProps
  | EcsSpanScopeProps
  | EcsSpanDiagnosticProps
  | undefined;

const ICON_ECS_ROOT = undefined;
const ICON_ECS_SPAN_SCOPE = new vscode.ThemeIcon("symbol-struct");
const ICON_ECS_SPAN_DIAGNOSTIC = new vscode.ThemeIcon("symbol-method");

/**
 * Maps props to tree item properties.
 */
const mapProps = (
  kind: NodeKind,
  props: NodeProps
): {
  label: string;
  description?: string;
  iconPath?: vscode.ThemeIcon | vscode.Uri | undefined;
  id?: string;
  collapsibleState?: vscode.TreeItemCollapsibleState;
} => {
  switch (kind) {
    case NodeKind.ECS_ROOT:
      const ecsRootProps = props as unknown as EcsRootProps;
      return {
        id: "ecs-root",
        label: "",
        description: "ECS SPANS",
        iconPath: undefined,
        collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
      };
    case NodeKind.ECS_SPAN_SCOPE:
      const ecsSpanScopeProps = props as unknown as EcsSpanScopeProps;
      const d = formatDuration(ecsSpanScopeProps.collapsedDuration, undefined);
      return {
        id: ecsSpanScopeProps.name,
        label: ecsSpanScopeProps.name,
        description: `(scope, ${d}, agg. spans: ${ecsSpanScopeProps.totalCount})`,
        iconPath: ICON_ECS_SPAN_SCOPE,
        collapsibleState:
          ecsSpanScopeProps.name === "system"
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.Collapsed,
      };
    case NodeKind.ECS_SPAN_DIAGNOSTIC:
      const ecsSpanDiagnosticProps = props as unknown as EcsSpanDiagnosticProps;
      return {
        id: ecsSpanDiagnosticProps.key,
        label: formatDuration(
          ecsSpanDiagnosticProps.duration,
          ecsSpanDiagnosticProps.count
        ),
        description: `${ecsSpanDiagnosticProps.name} (samples: ${ecsSpanDiagnosticProps.count})`,
        iconPath: ICON_ECS_SPAN_DIAGNOSTIC,
        collapsibleState: vscode.TreeItemCollapsibleState.None,
      };
    default:
      throw new Error(`Unknown node kind: ${kind}`);
  }
};

/**
 * A tree node representing a diagnostic.
 */
export class DiagnosticNode extends vscode.TreeItem {
  constructor(
    public readonly rank: number,
    public readonly kind: NodeKind,
    public readonly props: NodeProps
  ) {
    const { label, description, iconPath, id, collapsibleState } = mapProps(
      kind,
      props
    );
    super(label, collapsibleState);
    this.label = label;
    this.description = description;
    this.iconPath = iconPath;
    this.id = id;
  }

  ecsScopSpanProps(): EcsSpanScopeProps {
    if (this.kind == NodeKind.ECS_SPAN_SCOPE) {
      return this.props as unknown as EcsSpanScopeProps;
    }
    throw new Error("Not an ECS span scope node");
  }

  ecsSpanDiagnosticProps(): EcsSpanDiagnosticProps {
    if (this.kind == NodeKind.ECS_SPAN_DIAGNOSTIC) {
      return this.props as unknown as EcsSpanDiagnosticProps;
    }
    throw new Error("Not an ECS span diagnostic node");
  }
}

export class EcsSystemsProvider
  implements vscode.TreeDataProvider<DiagnosticNode>
{
  private ecsSpanByKey = new Map<string, EcsSpanDiagnosticProps>();
  private ecsScopes = new Set<string>();

  private _onDidChangeTreeData: vscode.EventEmitter<void> =
    new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData: vscode.Event<void> =
    this._onDidChangeTreeData.event;

  refresh(): void {
    // Index spans.
    type DiagnosticKey = string;
    const makeKey = (s: Span): DiagnosticKey => {
      return `${s.scope}#${s.name}`;
    };
    // Build diagnosticByKey map collapsing spans with the same name and scope.
    for (const s of this.ecsSpans) {
      this.ecsScopes.add(s.scope);
      const key = makeKey(s);
      const existing = this.ecsSpanByKey.get(key);
      if (existing === undefined) {
        this.ecsSpanByKey.set(key, {
          key,
          name: s.name,
          scope: s.scope,
          duration: s.duration,
          count: 1,
        });
      } else {
        existing.duration = addDuration(existing.duration, s.duration);
        existing.count++;
      }
    }
    this._onDidChangeTreeData.fire();
  }

  public ecsSpans: Span[] = [];

  getTreeItem(
    element: DiagnosticNode
  ): vscode.TreeItem | Thenable<vscode.TreeItem> {
    return element;
  }

  getChildren(
    element?: DiagnosticNode | undefined
  ): vscode.ProviderResult<DiagnosticNode[]> {
    // Return root node.
    if (element === undefined) {
      const aggDuration = this.ecsSpans.reduce(
        (a, b) => addDuration(a, b.duration),
        { secs: 0, nanos: 0 }
      );
      const aggCount = this.ecsSpans.length;
      return [new DiagnosticNode(0, NodeKind.ECS_ROOT, {})];
    }

    // Return scopes.
    if (element.kind === NodeKind.ECS_ROOT) {
      const scopes = [
        "system",
        ...Array.from(this.ecsScopes.values()).filter((v) => v !== "system"),
      ];
      return scopes.map((scope) => {
        let collapsedCount = 0;
        let collapsedDuration = { secs: 0, nanos: 0 };

        this.ecsSpanByKey.forEach((s, _) => {
          if (s.scope === scope) {
            collapsedCount += 1;
            const normDuration = divideDuration(s.duration, s.count);
            collapsedDuration = addDuration(collapsedDuration, normDuration);
          }
        });

        return new DiagnosticNode(1, NodeKind.ECS_SPAN_SCOPE, {
          name: scope,
          collapsedCount,
          collapsedDuration,
        });
      });
    }

    // Return diagnostics.
    if (element.kind === NodeKind.ECS_SPAN_SCOPE) {
      const scope = element.ecsScopSpanProps().name;
      // Get root diagnostics.
      const diagnostics = Array.from(this.ecsSpanByKey.values())
        .filter((v) => v.scope === scope)
        .map(
          (v) =>
            new DiagnosticNode(
              element.rank + 1,
              NodeKind.ECS_SPAN_DIAGNOSTIC,
              v
            )
        );
      // Sort by duration.
      diagnostics.sort((a, b) => {
        const da = a.ecsSpanDiagnosticProps().duration;
        const db = b.ecsSpanDiagnosticProps().duration;
        return db.secs * 1e9 + db.nanos - (da.secs * 1e9 + da.nanos);
      });
      return diagnostics;
    }

    return [];
  }
}
