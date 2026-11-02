#!/usr/bin/env node
import { buildProgram, handleProgramError } from "./program.js";

import { normalizeColorArgs } from "./output.js";

buildProgram().parseAsync(normalizeColorArgs(process.argv)).catch(handleProgramError);
