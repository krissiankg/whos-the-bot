import {cookies,headers} from "next/headers";
import {chooseLocale} from "../translations.mjs";
export async function requestLocale(){
  return chooseLocale((await cookies()).get("wtb_language")?.value,(await headers()).get("accept-language"));
}
