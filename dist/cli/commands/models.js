import { ModelError } from "../../errors.js";
import { formatBytes, printJson, printTable, c } from "../output.js";
export async function runModels(provider, models, json, options = { listModels: true }) {
    if (!options.listModels) {
        if (json) {
            printJson({ provider: provider.id, roles: definedModels(models), models: [], listModels: false });
        }
        else {
            process.stdout.write(`${c.dim(`${provider.id}: this endpoint has no model listing (endpoint.listModels: false). Role models are deployment names; run "air-review doctor" to probe them.`)}\n`);
        }
        return;
    }
    let list;
    try {
        list = await provider.listModels();
    }
    catch (error) {
        throw new ModelError(`Could not list models from ${provider.id}: ${error.message}`, {
            cause: error,
        });
    }
    if (json) {
        printJson({
            provider: provider.id,
            roles: definedModels(models),
            models: list,
            missing: configuredMissing(list.map((m) => m.name), definedModels(models)),
        });
        return;
    }
    const roleByModel = new Map();
    for (const [role, model] of Object.entries(definedModels(models))) {
        const roles = roleByModel.get(model) ?? [];
        roles.push(role);
        roleByModel.set(model, roles);
    }
    process.stdout.write(`${c.bold(provider.id)} — ${list.length} model(s) available\n\n`);
    if (list.length === 0) {
        process.stdout.write(`${c.dim("The endpoint reported no models. Check baseUrl and the model names in your config.")}\n`);
        return;
    }
    printTable(["model", "size", "params", "quant", "roles"], list.map((model) => [
        model.name,
        model.size !== undefined ? formatBytes(model.size) : "-",
        model.parameterSize ?? "-",
        model.quantizationLevel ?? "-",
        (roleByModel.get(model.name) ?? []).join(", ") || c.dim("-"),
    ]));
    const missing = configuredMissing(list.map((m) => m.name), definedModels(models));
    if (missing.length > 0) {
        process.stdout.write(`\n${c.yellow("warning")}: configured model(s) not offered by this endpoint: ${missing.join(", ")}\n`);
    }
}
function configuredMissing(available, models) {
    const wanted = [...new Set(Object.values(models))];
    return wanted.filter((model) => !available.includes(model) && !model.includes("/"));
}
function definedModels(models) {
    return Object.fromEntries(Object.entries(models).filter(([, model]) => Boolean(model)));
}
//# sourceMappingURL=models.js.map