/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { fetchApi } from "@/lib/api";
import { ShieldCheck, ShieldAlert, UploadCloud, Loader2, ChevronDown, CheckCircle2 } from "lucide-react";
import Image from "next/image";

type VerifyResult = {
  status: "SUCCESS" | "REJECTED";
  data?: any;
  message?: string;
};

export default function VerifyPage() {
  // Verification State
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);

  // Report Form State
  const [reportLoading, setReportLoading] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);
  const [reportData, setReportData] = useState({
    productName: "Panadol Extra",
    issues: "Product does not match original image",
    description: "",
  });
  const [paymentBill, setPaymentBill] = useState<File | null>(null);
  const [additionalImage, setAdditionalImage] = useState<File | null>(null);

  const handleFileChange = (setter: React.Dispatch<React.SetStateAction<File | null>>) => (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setter(e.target.files[0]);
    }
  };

  const verifyQR = async () => {
    if (!qrFile) return;
    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("qrImage", qrFile);
      if (frontFile) formData.append("frontImage", frontFile);
      if (backFile) formData.append("backImage", backFile);

      const res = await fetchApi("/verify", {
        method: "POST",
        body: formData,
      });

      setResult({ status: "SUCCESS", data: res.data });
    } catch (err: any) {
      setResult({ status: "REJECTED", message: err.message || "Counterfeit warning or mismatch detecting packaging." });
    } finally {
      setLoading(false);
    }
  };

  const submitReport = async () => {
    setReportLoading(true);
    try {
      const formData = new FormData();
      formData.append("productName", reportData.productName);
      formData.append("issues", reportData.issues);
      formData.append("description", reportData.description);
      if (paymentBill) formData.append("paymentBill", paymentBill);
      if (additionalImage) formData.append("additionalImage", additionalImage);

      await fetchApi("/reports", {
        method: "POST",
        body: formData,
      });

      setReportSuccess(true);
    } catch (err) {
      console.error(err);
      alert("Failed to submit report. Please try again.");
    } finally {
      setReportLoading(false);
    }
  };

  // UI Helper for file upload boxes
  const FileUploadBox = ({ title, file, setter }: { title: string, file: File | null, setter: any }) => (
    <div className="flex flex-col items-start gap-2">
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</span>
      <div className="relative w-full aspect-square md:aspect-video rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors overflow-hidden group">
        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange(setter)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-4 text-center">
          {file ? (
            <div className="w-full h-full relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={URL.createObjectURL(file)} alt="preview" className="w-full h-full object-cover rounded-lg opacity-80 group-hover:opacity-100 transition-opacity" />
              <div className="absolute bottom-2 left-2 right-2 bg-black/60 text-white text-xs truncate px-2 py-1 flex items-center justify-center rounded backdrop-blur-md">
                {file.name}
              </div>
            </div>
          ) : (
            <>
              <UploadCloud className="w-8 h-8 text-slate-400 mb-2" />
              <p className="text-xs font-medium text-slate-500">Tap to upload</p>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 md:py-16 space-y-10">

      {/* ──────────────────────────────────────────────────────────── */}
      {/* VERIFICATION FLOW */}
      {/* ──────────────────────────────────────────────────────────── */}
      {!result ? (
        <div className="space-y-8 animate-in fade-in zoom-in duration-500">
          <div className="text-center space-y-3">
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">Verify Product Identity</h1>
            <p className="text-base text-slate-500 dark:text-slate-400 max-w-xl mx-auto">
              Please provide clear photos of the product packaging and the QR code for structural AI analysis and ledger cross-checking.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <FileUploadBox title="1. QR Code Base" file={qrFile} setter={setQrFile} />
              <FileUploadBox title="2. Product Packaging (Front)" file={frontFile} setter={setFrontFile} />
              <FileUploadBox title="3. Product Packaging (Back)" file={backFile} setter={setBackFile} />
            </div>

            <div className="flex justify-center pt-4 border-t border-slate-100 dark:border-slate-800">
              <Button
                onClick={verifyQR}
                disabled={!qrFile || loading}
                className="w-full sm:w-auto h-12 px-10 rounded-xl text-white font-semibold text-base shadow-none"
                style={{ backgroundColor: "#5EB2BA" }}
              >
                {loading ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Analyzing 3-Point Assets...</> : "Verify Product Authenticity"}
              </Button>
            </div>
          </div>
        </div>
      ) : result.status === "SUCCESS" ? (
        /* ──────────────────────────────────────────────────────────── */
        /* SUCCESS STATE */
        /* ──────────────────────────────────────────────────────────── */
        <div className="max-w-xl mx-auto p-8 bg-green-50/50 dark:bg-green-950/20 border border-green-200 dark:border-green-800/40 rounded-2xl flex flex-col items-center text-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/50 rounded-full flex items-center justify-center">
            <ShieldCheck className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
          <h3 className="text-2xl font-bold text-green-700 dark:text-green-400 tracking-tight">Authentic Product Verified</h3>
          <p className="text-green-600/80 dark:text-green-300/80 text-sm">
            This product passed all AI structural checks and the cryptographic ownership signature matched the Hyperledger active block.
          </p>

          <div className="w-full mt-4 text-sm font-mono bg-white dark:bg-black/50 p-4 rounded-xl border border-green-100 dark:border-green-900 text-left space-y-1">
            <div className="flex justify-between border-b pb-2 mb-2 border-green-50 dark:border-green-900/50">
              <span className="text-slate-500">Batch ID</span>
              <span className="font-semibold">{result.data?.batch?.batchID || result.data?.batchID || "N/A"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Verdict</span>
              <span className="font-semibold text-green-600">ACCEPTED</span>
            </div>
          </div>

          <Button variant="outline" className="mt-4" onClick={() => setResult(null)}>Scan Another Product</Button>
        </div>
      ) : (
        /* ──────────────────────────────────────────────────────────── */
        /* REJECTED / REPORT FORM STATE */
        /* ──────────────────────────────────────────────────────────── */
        <div className="max-w-md mx-auto space-y-6 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">

          <div className="flex items-start gap-4 p-4 rounded-2xl bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30">
            <ShieldAlert className="w-8 h-8 text-red-500 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-red-700 dark:text-red-400">Suspicious Product Detected</h3>
              <p className="text-sm text-red-600/80 dark:text-red-300/80 mt-1 line-clamp-2">{result.message}</p>
            </div>
          </div>

          {reportSuccess ? (
            <div className="py-10 flex flex-col items-center text-center space-y-3">
              <CheckCircle2 className="w-16 h-16 text-[#5EB2BA]" />
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Report Submitted</h3>
              <p className="text-sm text-slate-500">Thank you. The regulatory compliance team will review your ticket shortly.</p>
              <Button variant="outline" className="mt-4 w-full" onClick={() => setResult(null)}>Back to Home</Button>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-800 dark:text-slate-200">Product Name</label>
                <input
                  type="text"
                  value={reportData.productName}
                  onChange={(e) => setReportData(p => ({ ...p, productName: e.target.value }))}
                  className="w-full h-12 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#5EB2BA] transition-all"
                  placeholder="e.g. Panadol Extra"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-800 dark:text-slate-200">Payment Bill</label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="aspect-square bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl relative overflow-hidden flex items-center justify-center">
                    {paymentBill ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={URL.createObjectURL(paymentBill)} alt="bill" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs text-slate-400">Preview</span>
                    )}
                  </div>
                  <div className="aspect-square rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center relative transition-colors cursor-pointer group">
                    <input type="file" onChange={handleFileChange(setPaymentBill)} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                    <span className="text-2xl text-slate-400 group-hover:text-[#5EB2BA]">+</span>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-800 dark:text-slate-200">Issues</label>
                <div className="relative">
                  <select
                    value={reportData.issues}
                    onChange={(e) => setReportData(p => ({ ...p, issues: e.target.value }))}
                    className="w-full h-12 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-[#5EB2BA]"
                  >
                    <option>Product does not match original image</option>
                    <option>Packaging has been tampered with</option>
                    <option>Suspicious pharmacy origin</option>
                    <option>No QR code matched</option>
                  </select>
                  <ChevronDown className="absolute right-4 top-3.5 w-5 h-5 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-800 dark:text-slate-200">Description</label>
                <textarea
                  value={reportData.description}
                  onChange={(e) => setReportData(p => ({ ...p, description: e.target.value }))}
                  className="w-full h-28 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#5EB2BA] resize-none"
                  placeholder="Provide additional details..."
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-800 dark:text-slate-200">Additional Image <span className="text-slate-400 font-normal">(Optional)</span></label>
                <div className="flex gap-4">
                  <div className="w-24 h-24 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 transition-colors flex flex-col items-center justify-center relative cursor-pointer">
                    <input type="file" onChange={handleFileChange(setAdditionalImage)} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                    {additionalImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={URL.createObjectURL(additionalImage)} alt="additional" className="w-full h-full object-cover rounded-xl" />
                    ) : (
                      <span className="text-2xl text-slate-400">+</span>
                    )}
                  </div>
                </div>
              </div>

              <Button
                onClick={submitReport}
                disabled={reportLoading}
                className="w-full h-12 rounded-xl text-white font-semibold text-base shadow-none mt-4"
                style={{ backgroundColor: "#5EB2BA" }}
              >
                {reportLoading ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Submitting Ticket...</> : "Submit"}
              </Button>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
