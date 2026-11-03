import { EXIT, ScmError } from "../../errors.js";
import { evaluateGate } from "../../review/gate.js";
import { decideVerdict } from "../../review/verdict.js";
import { extractState } from "../../state/ledger.js";
import { c, printJson } from "../output.js";
export function decideApproval(config, stateBody, pr) {
    const state = stateBody ? extractState(stateBody) : null;
    if (!state) {
        return {
            action: "no-review",
            reason: "no air-review state found on this pull request: run the review step first",
        };
    }
    if (state.pullRequest.headSha !== pr.headSha) {
        return {
            action: "stale",
            reason: `the review covers ${state.pullRequest.headSha.slice(0, 8)} but the pull request is now at ${pr.headSha.slice(0, 8)}: re-run the review`,
        };
    }
    const findings = state.findings;
    const counts = { BLOCKER: 0, CRITICAL: 0, MAJOR: 0, MINOR: 0, NITPICK: 0, INFO: 0 };
    let open = 0;
    let resolved = 0;
    for (const finding of findings) {
        if (finding.status === "RESOLVED")
            resolved += 1;
        else if (finding.status !== "WONT_FIX") {
            counts[finding.severity] = (counts[finding.severity] ?? 0) + 1;
            open += 1;
        }
    }
    const gate = evaluateGate(config, findings);
    const verdict = decideVerdict({
        open,
        gatePassed: gate.passed,
        incomplete: false,
        approveWithSuggestions: config.platform.azureDevops.vote.approveWithSuggestions,
    });
    const summary = {
        pr: { owner: pr.owner, repo: pr.repo, number: pr.number },
        reviewedHeadSha: state.pullRequest.headSha,
        gatePassed: gate.passed,
        verdict,
        counts: counts,
        open,
        resolved,
        metrics: {
            inputTokens: 0,
            outputTokens: 0,
            modelCalls: 0,
            contextRequests: 0,
            cacheHits: 0,
            durationMs: 0,
            deterministicFindings: 0,
            llmFindings: 0,
            verifiedFindings: 0,
        },
        warnings: [],
    };
    if (verdict === "request-changes") {
        return { action: "refuse", reason: `${gate.blocking.length} blocking finding(s) still open`, summary };
    }
    if (verdict === "comment") {
        return {
            action: "refuse",
            reason: `${open} finding(s) open and approval with suggestions is disabled`,
            summary,
        };
    }
    return {
        action: verdict,
        reason: open === 0 ? "no open finding" : `${open} non-blocking finding(s) open (nitpicks or low confidence)`,
        summary,
    };
}
export async function runApprove(ctx, options) {
    if (!ctx.scm.castVote) {
        throw new ScmError(`The ${ctx.scm.kind} platform has no reviewer vote; approval only applies to Azure DevOps pull requests.`);
    }
    const pr = await ctx.scm.getPullRequest();
    const decision = decideApproval(ctx.config, await ctx.scm.listState(), pr);
    const voted = decision.summary && (decision.action === "approve" || decision.action === "approve-with-suggestions");
    if (voted && !options.dryRun)
        await ctx.scm.castVote(decision.summary);
    if (options.json) {
        printJson({
            action: decision.action,
            reason: decision.reason,
            voted: Boolean(voted && !options.dryRun),
            headSha: pr.headSha,
        });
    }
    else {
        const label = decision.action === "approve"
            ? c.green("approved")
            : decision.action === "approve-with-suggestions"
                ? c.green("approved with suggestions")
                : c.red(decision.action === "refuse" ? "not approved" : decision.action);
        process.stdout.write(`${label}: ${decision.reason}${options.dryRun && voted ? " (dry run: no vote cast)" : ""}\n`);
    }
    if (decision.action === "no-review" || decision.action === "stale")
        return EXIT.SCM;
    return voted ? EXIT.OK : EXIT.GATE_FAILED;
}
//# sourceMappingURL=approve.js.map