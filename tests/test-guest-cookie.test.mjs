import test from "node:test";
import assert from "node:assert/strict";
import {guestSetCookie} from "../scripts/test-guest-cookie.mjs";
test("guest test jar ignores platform cookies regardless of order",()=>{for(const entries of [["__cf_bm=platform; SameSite=None; Secure","wtb_guest=guest; HttpOnly; SameSite=lax"],["wtb_guest=guest; HttpOnly; SameSite=lax","__cf_bm=platform; SameSite=None; Secure"]]){const h=new Headers();for(const value of entries)h.append("Set-Cookie",value);assert.equal(guestSetCookie(h),"wtb_guest=guest; HttpOnly; SameSite=lax");}});
test("guest test jar retains its credential when only a platform cookie changes",()=>{assert.equal(guestSetCookie(new Headers({"Set-Cookie":"__cf_bm=platform; SameSite=None"})),null);assert.equal(guestSetCookie(new Headers()),null);});
