# Third-party notices and acknowledgements

Recursus original code and documentation are licensed under MIT. This does not replace, weaken, or expand the licenses of the projects it references, consumes, or later distributes.

The repository records external components by immutable revision and includes a Recursus-owned assembly source lock, acquisition/build adapters, package inspector, deterministic package integrity, accepted-run evidence, and preserved historical blocked-run evidence. It does not vendor component source or package archives. Read-only checkouts and local archives created beneath an operator-configured work root remain external component material under their own terms and are excluded from Recursus release output. Generated integrity proves the accepted local bytes; redistribution remains blocked where the source lock says owner terms are pending or composite review is required.

## DeepSeek Harness

- Component: [`OpenCnid/deepseek-harness`](https://github.com/OpenCnid/deepseek-harness)
- Upstream: [`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness)
- Pinned revision: `29c8342b37d76e5dd4ca8daff4beb7743b8e22a0` (`dsh-v0.1.0-rc.7` package set plus reviewed portable-bundle and public-session seam fixes)
- License: MIT

DeepSeek AI and the DeepSeek Harness contributors provide the plugin-first agent control plane on which Recursus is built. The DSH repository vendors and credits Cordis, CosmoKit, Schemastery, and related foundations under their preserved licenses. Recursus does not imply endorsement by DeepSeek AI.

## Cordis and framework foundations

Cordis and its associated foundation libraries make DSH's composable service architecture possible. The pinned DSH source records their exact provenance and MIT licenses in its vendored notices. Recursus consumes those contracts through DSH rather than republishing Cordis source.

## OpenAI Codex adapter and Pi

- Component: [`OpenCnid/deepseek-openai-codex`](https://github.com/OpenCnid/deepseek-openai-codex)
- Pinned revision: `5232102d0cc8bd55d5bf27b6eb203efbf6ada8a9`
- Component licensing status: no single root license selected at this revision; see that repository's `THIRD_PARTY_NOTICES.md`
- Runtime provider substrate: `@earendil-works/pi-ai@0.84.2`, reported MIT

The adapter uses an OpenAI Codex subscription through Pi's direct provider and OAuth work. Recursus credits OpenAI, Mario Zechner, Earendil Works, and the Pi contributors without implying endorsement. Until the adapter owner selects public license terms, Recursus may reference and test the external repository but must not copy, relicense, or redistribute its original adapter code as MIT.

OpenAI and Codex are trademarks of their respective owners. Recursus is not an OpenAI product.

## DeepSeek RLM, Prime Agent, Jupyter, and IPython

- Component: [`OpenCnid/deepseek-rlm`](https://github.com/OpenCnid/deepseek-rlm)
- Pinned component revision: `4772c12b0630706f14d16e70be0ad67bff116690`
- Inspected compute boundary: `79b6b28e16c7305e8e791f2d8c9d2935e75ade60`
- License: MIT

DeepSeek RLM provides persistent IPython state, snapshots, native recursive DSH children, and the Python-to-DSH tool bridge. It records adapted persistent-kernel and namespace-snapshot techniques from Prime Agent revision `f8f0036cc2da1a640aad990ae8dcb7c4820ce32e`, also MIT, with upstream notices preserved in that component.

Project Jupyter, Jupyter Client, IPython, and their contributors provide the underlying computational ecosystem. Their packages retain the licenses recorded in the RLM Python lock and notices.

## DeepSeek Honcho and Honcho SDK

- Component: [`OpenCnid/deepseek-honcho`](https://github.com/OpenCnid/deepseek-honcho)
- Pinned revision: `83627329867a562959cf992d0ce56d78a273971a`
- Component license: Apache-2.0
- Official SDK: `@honcho-ai/sdk@2.3.0`, Apache-2.0, inspected at Honcho revision `ddbb90e36f2d148c7982f6ed85b09d31cabf5944`

Honcho and Plastic Labs provide the cross-session memory service and official SDK. The Honcho server/MCP repository is AGPL-3.0; the component reports that it inspected public contracts without copying server, MCP, or skill source. Recursus does not imply endorsement by Honcho or Plastic Labs.

## DeepSeek Dovetail and method authors

- Component: [`OpenCnid/deepseek-dovetail`](https://github.com/OpenCnid/deepseek-dovetail)
- Pinned component revision: `fec14d795edb5e52c02e2ccc49d9af6004fddee0`
- Pinned Dovetail source: `69f89e3322847fb11665980c16598494a9eacca0`
- Licensing status: composite; see the component's `THIRD_PARTY_NOTICES.md` and each packaged skill's adjacent license

The Dovetail source repository states CC BY 4.0 for covered prose/scripts, while individual skills retain their adjacent terms. `better-skill-creator` is Apache-2.0 with its required notice. Other skills preserve their own `LICENSE.md` and notice files.

Recursus thanks Matthew Murphy and Lexideck for methods and provenance preserved by Prompt Engineering, Self Play, and Subagent Composition; the authors of *The Design Space of Agentic Systems* and the SPARK framework; and every Dovetail contributor. The DSH adapter's new code did not have a single owner-selected public license at the pinned revision. Recursus therefore references it externally and does not claim that the Recursus MIT license covers or relicenses it.

## Non-endorsement and release review

Names and links identify provenance and express gratitude. They do not imply sponsorship or endorsement.

Before Recursus distributes any component artifact, release tooling must:

1. resolve the exact pinned source and package hashes;
2. carry the component's complete license and notice closure;
3. verify redistribution permission for components whose owner terms are pending or composite;
4. regenerate dependency notices from the assembled lockfiles;
5. keep development-only and runtime-distributed dependencies distinguishable.
