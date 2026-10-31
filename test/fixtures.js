export const PAGE = `
<div class="mw-parser-output">
<p><b>Example Bridge</b> is a steel arch bridge in Ohio. The bridge opened to traffic in 1932.<sup id="cite_ref-1" class="reference"><a href="#cite_note-1"><span class="cite-bracket">[</span>1<span class="cite-bracket">]</span></a></sup> The U.S. Army used it in 1940.<sup id="cite_ref-S_2-0" class="reference"><a href="#cite_note-Smith-2">[2]</a></sup><sup id="cite_ref-3" class="reference"><a href="#cite_note-3">[3]</a></sup> Locals loved it &amp; used it daily.</p>
<p>A short one.<sup class="reference"><a href="#cite_note-1">[1]</a></sup></p>
<ol class="references">
<li id="cite_note-1"><span class="mw-cite-backlink"><a href="#cite_ref-1">^</a></span> <span class="reference-text"><a class="external text" href="https://example.com/archive?id=1&amp;x=2">City Archives</a>. <a href="https://web.archive.org/web/2020/https://example.com/archive">Archived</a>. <a href="/wiki/Special:BookSources/123">ISBN</a></span></li>
<li id="cite_note-Smith-2"><span class="reference-text"><a class="external text" href="//doi.org/10.1/abc">Smith</a></span></li>
<li id="cite_note-3"><span class="reference-text">Jones, A Book. <a href="https://en.wikipedia.org/wiki/Special:BookSources/978">ISBN 978</a></span></li>
</ol>
</div>`;

const cite = (id, label) =>
  `<sup class="reference"><a href="#cite_note-${id}"><span class="cite-bracket">[</span>${label}<span class="cite-bracket">]</span></a></sup>`;

export const DIANA = `<div class="mw-parser-output">
<p>Diana Cage (born July 16, 1979) is an American author. She is author and editor of eight books on sex and relationships, including the Lambda Literary Award\u2013winning Lesbian Sex Bible, and served as editor of several influential lesbian publications of the 2000s, including On Our Backs, Velvetpark, and GO magazine.${cite(1, 1)} From 2006 to 2009 she hosted The Diana Cage Show on SiriusXM, an advice and call-in show focused on lesbian sex.</p>
<p>In 2000 she joined On Our Backs, the long-running lesbian erotica magazine founded in 1984, and served as its editor until 2005. Under her editorship, the magazine expanded its representation of lesbian sex and sexual identity.${cite(2, 2)}</p>
<p>Heather Findlay, publisher of both On Our Backs and Girlfriends (magazine), praised Cage's "lack of self censorship" as an editor, saying, "[Cage] is not uptight about all forms of lesbian sexual expression. She really has no prejudgments about alternative sexuality."${cite("sf", 3)} Cage has likewise been praised as an "unapologetic pioneer" in the evolution of progressive, sex-positive lesbian culture.${cite(4, 4)}${cite(5, 5)}</p>
<p>After leaving On Our Backs, Cage continued working in queer media. In 2008 she was named one of GO Magazine's "100 Women We Love."${cite(6, 6)}</p>
<p>From 2006 to 2009 Cage was host of The Diana Cage Show on SiriusXM${cite(8, 8)} The show was celebrated for Cage's bombastic monologues,${cite(9, 9)} incisive commentary on current events, and unflinching advice on love and sex.${cite("sf", 3)}</p>
<p>Cage was formerly host of The Diana Cage Show on SiriusXM. She was a recurring guest on The Derek and Romaine Show on SiriusXM and appeared as a series regular on Here TV, the LGBT cable network.${cite(10, 10)}</p>
<ol class="references">
<li id="cite_note-1"><span class="reference-text"><a class="external text" href="https://nymag.example/bois">Where the Bois Are</a></span></li>
<li id="cite_note-2"><span class="reference-text"><a class="external text" href="https://xtra.example/smut">Lesbian smut censored</a></span></li>
<li id="cite_note-sf"><span class="reference-text"><a class="external text" href="https://sfgate.example/profile">She makes a living thinking about sex</a>. Archived from <a class="external text" href="https://web.archive.org/web/2010/https://sfgate.example/profile">the original</a>.</span></li>
<li id="cite_note-4"><span class="reference-text"><a class="external text" href="https://brightlights.example/qdoc">Closing the Closet</a></span></li>
<li id="cite_note-5"><span class="reference-text"><a class="external text" href="https://pride.example/dick">You Don't Say Dick</a></span></li>
<li id="cite_note-6"><span class="reference-text"><a class="external text" href="https://gomag.example/lucky7">Lucky 7</a></span></li>
<li id="cite_note-8"><span class="reference-text"><a class="external text" href="https://masslive.example/fringe">Fringe Benefits</a></span></li>
<li id="cite_note-9"><span class="reference-text"><a class="external text" href="https://curve.example/humorless">Humorless Lesbian Myth</a></span></li>
<li id="cite_note-10"><span class="reference-text"><a class="external text" href="https://gomag.example/100women">100 Women We Love</a></span></li>
</ol></div>`;
