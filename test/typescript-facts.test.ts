import { describe, expect, it } from "vitest";
import { extractFileFacts } from "../src/context/typescript-facts.js";

describe("extractFileFacts", () => {
  it("counts a subscription wrapped in effect() once, on the subscribe line", () => {
    const facts = extractFileFacts(
      "w.ts",
      [
        "import { Component, effect, inject } from '@angular/core';",
        "@Component({ selector: 'x', template: '' })",
        "export class PromoComponent {",
        "  private readonly api = inject(Api);",
        "  constructor() {",
        "    effect(() => {",
        "      const code = this.code();",
        "      this.api.preview(code).subscribe({ next: (p) => this.preview.set(p) });",
        "    });",
        "    void this.api.ping().subscribe();",
        "  }",
        "}",
      ].join("\n"),
    );
    expect(facts.subscriptions.map((s) => `${s.line}:${s.cleanup}`)).toEqual(["8:none", "10:none"]);
  });

  it("extracts Angular component symbols, injections and subscriptions", () => {
    const facts = extractFileFacts(
      "src/app/order.component.ts",
      [
        "import { Component, inject, OnInit } from '@angular/core';",
        "import { Router } from '@angular/router';",
        "import { OrderApi } from './order-api';",
        "",
        "@Component({ selector: 'app-order', templateUrl: './order.component.html', standalone: true })",
        "export class OrderComponent implements OnInit {",
        "  @Input() id = '';",
        "  @Output() saved = new EventEmitter();",
        "  private readonly api = inject(OrderApi);",
        "  constructor(private router: Router) {}",
        "",
        "  ngOnInit(): void {",
        "    this.api.events$.subscribe(() => this.router.navigate(['x']));",
        "  }",
        "}",
      ].join("\n"),
    );

    const component = facts.symbols.find((s) => s.kind === "component");
    expect(component?.name).toBe("OrderComponent");
    expect(component?.selector).toBe("app-order");
    expect(component?.standalone).toBe(true);
    expect(component?.inputs).toEqual(["id"]);
    expect(component?.outputs).toEqual(["saved"]);
    expect(component?.injected).toEqual(["OrderApi", "Router"]);

    expect(facts.subscriptions).toHaveLength(1);
    expect(facts.subscriptions[0]?.cleanup).toBe("none");
    expect(facts.subscriptions[0]?.owner).toBe("OrderComponent");
    expect(facts.subscriptions[0]?.line).toBe(13);
  });

  it("recognizes takeUntilDestroyed and ngOnDestroy teardown", () => {
    const withOperator = extractFileFacts(
      "a.ts",
      [
        "import { Component, DestroyRef, inject } from '@angular/core';",
        "import { takeUntilDestroyed } from '@angular/core/rxjs-interop';",
        "@Component({selector: 'a'})",
        "export class A {",
        "  ref = inject(DestroyRef);",
        "  go() { this.s$.pipe(takeUntilDestroyed(this.ref)).subscribe(); }",
        "}",
      ].join("\n"),
    );
    expect(withOperator.subscriptions[0]?.cleanup).toBe("takeUntilDestroyed");

    const manual = extractFileFacts(
      "b.ts",
      [
        "import { Component } from '@angular/core';",
        "@Component({selector: 'b'})",
        "export class B {",
        "  sub: any;",
        "  go() { this.sub = this.s$.subscribe(); }",
        "  ngOnDestroy() { this.sub.unsubscribe(); }",
        "}",
      ].join("\n"),
    );
    expect(manual.subscriptions[0]?.cleanup).toBe("manual-unsubscribe");
  });
});

it("does not treat an unused DestroyRef or Subject declaration as cleanup", () => {
  for (const declaration of ["ref = inject(DestroyRef);", "destroy$ = new Subject<void>();"]) {
    const facts = extractFileFacts("a.ts", `class A { ${declaration}\n go() { this.events$.subscribe(); } }`);
    expect(facts.subscriptions[0]?.cleanup).toBe("none");
  }
});
