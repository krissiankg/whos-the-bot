import type { Metadata } from "next";
import { AdminDashboard } from "@/components/admin-dashboard";
import {requestLocale} from "@/lib/server/language";
export async function generateMetadata():Promise<Metadata>{return {title:(await requestLocale()) === "fr"?"Administration · Who’s the Bot ?":"Owner settings · Who’s the Bot?",robots:{index:false,follow:false},referrer:"no-referrer"};}
export default function AdminPage(){return <AdminDashboard/>;}
