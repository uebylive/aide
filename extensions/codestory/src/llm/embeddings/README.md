# Super important:

src2 contains the files from @xenova/transformers
@xenova/transformers is in esm format, so we can't import it properly in our
project, instead we fork the library and then install all the required dependencies
of the @xenova/transformers in our own project and then change the following:
__dirname (which is a constant in commonjs)
and change the module.export style properly.


# So what do we do when we have to upgrade?
Pray to the git merge gods and hope it works out.
