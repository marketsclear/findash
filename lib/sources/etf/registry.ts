import { etha, ethb } from "./ishares";
import { ethe, ethMini } from "./grayscale";
import { teth } from "./twentyone";
import { qeth } from "./invesco";
import { ethw } from "./bitwise";
import { ethv } from "./vaneck";
import { ezet } from "./franklin";
import { feth } from "./fidelity";
import type { FundAdapter } from "./types";

/** US spot ether ETFs, in Farside's column order. */
export const ADAPTERS: FundAdapter[] = [etha, ethb, feth, ethw, teth, ethv, qeth, ezet, ethe, ethMini];
