// Ghidra post-script: dump the function map of the current program to a TSV file.
// Invoked by scripts/analyze.ps1, not by hand.
//
// Output format: address <TAB> size <TAB> full function name

import ghidra.app.script.GhidraScript;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionIterator;

import java.io.File;
import java.io.PrintWriter;

public class DumpSymbols extends GhidraScript {

    @Override
    public void run() throws Exception {
        String[] args = getScriptArgs();
        if (currentProgram == null) {
            println("DumpSymbols: no program loaded");
            return;
        }

        File outFile = (args.length > 0)
                ? new File(args[0])
                : new File(currentProgram.getName() + "-symbols.tsv");

        File parent = outFile.getParentFile();
        if (parent != null && !parent.exists()) {
            parent.mkdirs();
        }

        PrintWriter out = new PrintWriter(outFile, "UTF-8");
        try {
            out.println("# program\t" + currentProgram.getName());
            out.println("# language\t" + currentProgram.getLanguageID());
            out.println("# imageBase\t" + currentProgram.getImageBase());
            out.println("# address\tsize\tname");

            int count = 0;
            FunctionIterator functions = currentProgram.getFunctionManager().getFunctions(true);
            while (functions.hasNext()) {
                Function f = functions.next();
                out.println(f.getEntryPoint() + "\t"
                        + f.getBody().getNumAddresses() + "\t"
                        + f.getName(true));
                count++;
            }
            println("DumpSymbols: wrote " + count + " functions to " + outFile.getAbsolutePath());
        } finally {
            out.close();
        }
    }
}
