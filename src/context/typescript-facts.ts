import ts from "typescript";

export interface SymbolFact {
  kind: "component" | "directive" | "service" | "pipe" | "class" | "function" | "interface";
  name: string;
  line: number;
  /** For components: decorator metadata of interest. */
  selector?: string;
  templateUrl?: string;
  standalone?: boolean;
  inputs: string[];
  outputs: string[];
  injected: string[];
  methods: Array<{ name: string; line: number }>;
}

export interface SubscriptionFact {
  line: number;
  /** How (if at all) the subscription is torn down. */
  cleanup: "none" | "takeUntilDestroyed" | "manual-unsubscribe" | "subject-teardown" | "other";
  /** Name of the owning class, when known. */
  owner?: string;
}

export interface FileFacts {
  path: string;
  symbols: SymbolFact[];
  subscriptions: SubscriptionFact[];
  imports: string[];
  usesInject: boolean;
}

function decoratorName(node: ts.Decorator): string {
  const expr = node.expression;
  if (ts.isCallExpression(expr)) {
    if (ts.isIdentifier(expr.expression)) return expr.expression.text;
    if (ts.isPropertyAccessExpression(expr.expression)) return expr.expression.name.text;
  }
  if (ts.isIdentifier(expr)) return expr.text;
  return "";
}

function decoratorObject(decorator: ts.Decorator): ts.ObjectLiteralExpression | undefined {
  if (!ts.isCallExpression(decorator.expression)) return undefined;
  return decorator.expression.arguments.find(ts.isObjectLiteralExpression);
}

function stringProperty(obj: ts.ObjectLiteralExpression | undefined, name: string): string | undefined {
  if (!obj) return undefined;
  const prop = obj.properties.find(
    (p): p is ts.PropertyAssignment =>
      ts.isPropertyAssignment(p) &&
      (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
      p.name.text === name,
  );
  if (!prop || !ts.isStringLiteralLike(prop.initializer)) return undefined;
  return prop.initializer.text;
}

function booleanProperty(obj: ts.ObjectLiteralExpression | undefined, name: string): boolean | undefined {
  if (!obj) return undefined;
  const prop = obj.properties.find(
    (p): p is ts.PropertyAssignment =>
      ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === name,
  );
  if (!prop) return undefined;
  return prop.initializer.kind === ts.SyntaxKind.TrueKeyword;
}

function lineOf(source: ts.SourceFile, node: ts.Node): number {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

function collectClass(source: ts.SourceFile, node: ts.ClassDeclaration): SymbolFact | null {
  if (!node.name) return null;
  const name = node.name.text;
  const decorators = ts.canHaveDecorators(node) ? ts.getDecorators(node) : undefined;
  const angularDecorator = decorators?.find((d) =>
    ["Component", "Directive", "Pipe", "Injectable"].includes(decoratorName(d)),
  );
  const meta = angularDecorator ? decoratorObject(angularDecorator) : undefined;

  let kind: SymbolFact["kind"] = "class";
  if (angularDecorator) {
    const n = decoratorName(angularDecorator);
    kind =
      n === "Component" ? "component" : n === "Directive" ? "directive" : n === "Pipe" ? "pipe" : "service";
  }

  const inputs: string[] = [];
  const outputs: string[] = [];
  const injected: string[] = [];
  const methods: Array<{ name: string; line: number }> = [];

  for (const member of node.members) {
    if (ts.isPropertyDeclaration(member)) {
      const memberDecorators = ts.canHaveDecorators(member) ? ts.getDecorators(member) : undefined;
      for (const dec of memberDecorators ?? []) {
        const n = decoratorName(dec);
        if (n === "Input") inputs.push(member.name.getText(source));
        if (n === "Output") outputs.push(member.name.getText(source));
      }
      if (member.initializer) {
        const text = member.initializer.getText(source);
        const match = text.match(/inject\s*\(\s*([^)]+)\)/);
        if (match?.[1]) injected.push(match[1].trim());
      }
    }
    if (ts.isConstructorDeclaration(member)) {
      for (const param of member.parameters) {
        if (param.type) injected.push(param.type.getText(source));
      }
    }
    if (ts.isMethodDeclaration(member)) {
      methods.push({ name: member.name.getText(source), line: lineOf(source, member) });
      member.body?.statements.forEach((statement) => {
        const match = statement.getText(source).match(/inject\s*\(\s*([^)]+)\)/);
        if (match?.[1]) injected.push(match[1].trim());
      });
    }
  }

  return {
    kind,
    name,
    line: lineOf(source, node),
    selector: stringProperty(meta, "selector"),
    templateUrl: stringProperty(meta, "templateUrl"),
    standalone: booleanProperty(meta, "standalone"),
    inputs,
    outputs,
    injected: [...new Set(injected)],
    methods,
  };
}

function classTeardownFacts(
  source: ts.SourceFile,
  node: ts.ClassDeclaration,
): {
  hasNgOnDestroyUnsubscribe: boolean;
  hasDestroySubject: boolean;
} {
  let hasNgOnDestroyUnsubscribe = false;
  let hasDestroySubject = false;
  for (const member of node.members) {
    if (
      ts.isMethodDeclaration(member) &&
      member.name.getText(source) === "ngOnDestroy" &&
      /unsubscribe\(\)|\.complete\(\)/.test(member.getText(source))
    ) {
      hasNgOnDestroyUnsubscribe = true;
    }
    if (ts.isPropertyDeclaration(member) && /Subject|DestroyRef|takeUntil/i.test(member.getText(source))) {
      hasDestroySubject = true;
    }
  }
  return { hasNgOnDestroyUnsubscribe, hasDestroySubject };
}

function classifyCleanup(
  text: string,
  teardown: ReturnType<typeof classTeardownFacts>,
): SubscriptionFact["cleanup"] {
  if (/takeUntilDestroyed/.test(text)) return "takeUntilDestroyed";
  if (/takeUntil\(/.test(text) || /\.add\(/.test(text)) return "other";
  if (teardown.hasNgOnDestroyUnsubscribe) return "manual-unsubscribe";
  // Declaring a DestroyRef or Subject alone does not connect this subscription to teardown.
  return "none";
}

/** Extract structural facts from a TypeScript/Angular file without type resolution. */
export function extractFileFacts(path: string, content: string): FileFacts {
  const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const symbols: SymbolFact[] = [];
  const subscriptions: SubscriptionFact[] = [];
  const imports: string[] = [];
  let usesInject = false;

  let currentClass: ts.ClassDeclaration | null = null;
  const currentTeardown = () =>
    currentClass
      ? classTeardownFacts(source, currentClass)
      : { hasNgOnDestroyUnsubscribe: false, hasDestroySubject: false };

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push(node.moduleSpecifier.text);
    }
    if (ts.isClassDeclaration(node)) {
      currentClass = node;
      const fact = collectClass(source, node);
      if (fact) symbols.push(fact);
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "inject") {
      usesInject = true;
    }
    if (ts.isExpressionStatement(node) && /\.subscribe\s*\(/.test(node.getText(source))) {
      const text = node.getText(source);
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      subscriptions.push({
        line,
        cleanup: classifyCleanup(text, currentTeardown()),
        owner: currentClass?.name?.text,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  const seen = new Set<string>();
  const uniqueSubscriptions = subscriptions.filter((fact) => {
    const key = `${fact.owner ?? ""}:${fact.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { path, symbols, subscriptions: uniqueSubscriptions, imports, usesInject };
}

export function isAngularFile(path: string): boolean {
  return /\.ts$/.test(path) && !/\.(spec|test)\.ts$/.test(path);
}
