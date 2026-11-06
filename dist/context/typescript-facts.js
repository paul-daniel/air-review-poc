import ts from "typescript";
function decoratorName(node) {
    const expr = node.expression;
    if (ts.isCallExpression(expr)) {
        if (ts.isIdentifier(expr.expression))
            return expr.expression.text;
        if (ts.isPropertyAccessExpression(expr.expression))
            return expr.expression.name.text;
    }
    if (ts.isIdentifier(expr))
        return expr.text;
    return "";
}
function decoratorObject(decorator) {
    if (!ts.isCallExpression(decorator.expression))
        return undefined;
    return decorator.expression.arguments.find(ts.isObjectLiteralExpression);
}
function stringProperty(obj, name) {
    if (!obj)
        return undefined;
    const prop = obj.properties.find((p) => ts.isPropertyAssignment(p) &&
        (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
        p.name.text === name);
    if (!prop || !ts.isStringLiteralLike(prop.initializer))
        return undefined;
    return prop.initializer.text;
}
function booleanProperty(obj, name) {
    if (!obj)
        return undefined;
    const prop = obj.properties.find((p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === name);
    if (!prop)
        return undefined;
    return prop.initializer.kind === ts.SyntaxKind.TrueKeyword;
}
function lineOf(source, node) {
    return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}
function collectClass(source, node) {
    if (!node.name)
        return null;
    const name = node.name.text;
    const decorators = ts.canHaveDecorators(node) ? ts.getDecorators(node) : undefined;
    const angularDecorator = decorators?.find((d) => ["Component", "Directive", "Pipe", "Injectable"].includes(decoratorName(d)));
    const meta = angularDecorator ? decoratorObject(angularDecorator) : undefined;
    let kind = "class";
    if (angularDecorator) {
        const n = decoratorName(angularDecorator);
        kind =
            n === "Component" ? "component" : n === "Directive" ? "directive" : n === "Pipe" ? "pipe" : "service";
    }
    const inputs = [];
    const outputs = [];
    const injected = [];
    const methods = [];
    for (const member of node.members) {
        if (ts.isPropertyDeclaration(member)) {
            const memberDecorators = ts.canHaveDecorators(member) ? ts.getDecorators(member) : undefined;
            for (const dec of memberDecorators ?? []) {
                const n = decoratorName(dec);
                if (n === "Input")
                    inputs.push(member.name.getText(source));
                if (n === "Output")
                    outputs.push(member.name.getText(source));
            }
            if (member.initializer) {
                const text = member.initializer.getText(source);
                const match = text.match(/inject\s*\(\s*([^)]+)\)/);
                if (match?.[1])
                    injected.push(match[1].trim());
            }
        }
        if (ts.isConstructorDeclaration(member)) {
            for (const param of member.parameters) {
                if (param.type)
                    injected.push(param.type.getText(source));
            }
        }
        if (ts.isMethodDeclaration(member)) {
            methods.push({ name: member.name.getText(source), line: lineOf(source, member) });
            member.body?.statements.forEach((statement) => {
                const match = statement.getText(source).match(/inject\s*\(\s*([^)]+)\)/);
                if (match?.[1])
                    injected.push(match[1].trim());
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
function classTeardownFacts(source, node) {
    let hasNgOnDestroyUnsubscribe = false;
    let hasDestroySubject = false;
    for (const member of node.members) {
        if (ts.isMethodDeclaration(member) &&
            member.name.getText(source) === "ngOnDestroy" &&
            /unsubscribe\(\)|\.complete\(\)/.test(member.getText(source))) {
            hasNgOnDestroyUnsubscribe = true;
        }
        if (ts.isPropertyDeclaration(member) && /Subject|DestroyRef|takeUntil/i.test(member.getText(source))) {
            hasDestroySubject = true;
        }
    }
    return { hasNgOnDestroyUnsubscribe, hasDestroySubject };
}
function classifyCleanup(text, teardown) {
    if (/takeUntilDestroyed/.test(text))
        return "takeUntilDestroyed";
    if (/takeUntil\(/.test(text) || /\.add\(/.test(text))
        return "other";
    if (teardown.hasNgOnDestroyUnsubscribe)
        return "manual-unsubscribe";
    // Declaring a DestroyRef or Subject alone does not connect this subscription to teardown.
    return "none";
}
/** Extract structural facts from a TypeScript/Angular file without type resolution. */
export function extractFileFacts(path, content) {
    const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const symbols = [];
    const subscriptions = [];
    const imports = [];
    let usesInject = false;
    let currentClass = null;
    const currentTeardown = () => currentClass
        ? classTeardownFacts(source, currentClass)
        : { hasNgOnDestroyUnsubscribe: false, hasDestroySubject: false };
    const visit = (node) => {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
            imports.push(node.moduleSpecifier.text);
        }
        if (ts.isClassDeclaration(node)) {
            currentClass = node;
            const fact = collectClass(source, node);
            if (fact)
                symbols.push(fact);
        }
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "inject") {
            usesInject = true;
        }
        // Only the statement whose own call ends in `.subscribe(`: a wrapper such as
        // `effect(() => { …subscribe(…) })` must not be counted a second time.
        if (ts.isExpressionStatement(node) && endsWithSubscribe(node.expression)) {
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
    const seen = new Set();
    const uniqueSubscriptions = subscriptions.filter((fact) => {
        const key = `${fact.owner ?? ""}:${fact.line}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
    return { path, symbols, subscriptions: uniqueSubscriptions, imports, usesInject };
}
export function isAngularFile(path) {
    return /\.ts$/.test(path) && !/\.(spec|test)\.ts$/.test(path);
}
function endsWithSubscribe(expression) {
    let current = expression;
    for (;;) {
        if (ts.isVoidExpression(current) || ts.isAwaitExpression(current) || ts.isParenthesizedExpression(current)) {
            current = current.expression;
        }
        else if (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
            current = current.right; // `this.sub = this.s$.subscribe()`
        }
        else {
            break;
        }
    }
    return (ts.isCallExpression(current) &&
        ts.isPropertyAccessExpression(current.expression) &&
        current.expression.name.text === "subscribe");
}
//# sourceMappingURL=typescript-facts.js.map