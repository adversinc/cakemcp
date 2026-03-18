import stylistic from "@stylistic/eslint-plugin";
import jsdoc from "eslint-plugin-jsdoc";
import tseslint from "typescript-eslint";

const indentRule = [
	"error",
	"tab",
	{
		SwitchCase: 1,
		ignoredNodes: [
			"FunctionExpression > .params[decorators.length > 0]",
			"FunctionExpression > .params > :matches(Decorator, :not(:first-child))",
			"ClassBody.body > PropertyDefinition[decorators.length > 0] > .key",
		],
	},
];

export default tseslint.config(
	{
		ignores: [
			"node_modules/**",
			"demo-data/**",
			"local-data/**",
		],
	},
	{
		files: ["**/*.ts"],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				ecmaVersion: "latest",
				sourceType: "module",
			},
		},
		plugins: {
			"@stylistic": stylistic,
			"@typescript-eslint": tseslint.plugin,
			jsdoc,
		},
		rules: {
			"semi": "off",
			"indent": "off",
			"keyword-spacing": "off",
			"object-curly-spacing": "off",
			"space-before-blocks": "off",
			"padding-line-between-statements": "off",
			"lines-around-comment": "off",
			"operator-linebreak": "off",

			"@stylistic/semi": ["error", "always"],
			"@stylistic/indent": indentRule,
			"@stylistic/keyword-spacing": [
				"error",
				{
					overrides: {
						if: { after: false },
						for: { after: false },
						while: { after: false },
						static: { after: false },
						catch: { after: false },
						as: { after: false },
						switch: { after: false },
					},
				},
			],
			"@stylistic/object-curly-spacing": ["error", "always"],
			"@stylistic/space-before-blocks": "error",
			"@stylistic/padding-line-between-statements": [
				"error",
				{ blankLine: "always", prev: "*", next: "function" },
			],
			"@stylistic/lines-around-comment": [
				"error",
				{
					beforeBlockComment: true,
					allowBlockStart: true,
					allowObjectStart: true,
				},
			],
			"@stylistic/operator-linebreak": [
				"error",
				"after",
			],

			"no-var": "off",
			"no-undef": "off",
			"no-unused-vars": "off",
			"no-constant-condition": "off",
			"no-case-declarations": "off",
			"prefer-rest-params": "off",

			"@typescript-eslint/no-empty-interface": "off",
			"@typescript-eslint/no-var-requires": "off",
			"@typescript-eslint/no-empty-function": "off",
			"@typescript-eslint/no-inferrable-types": "off",
			"@typescript-eslint/ban-ts-comment": "off",

			"jsdoc/require-jsdoc": [
				"error",
				{
					require: {
						FunctionDeclaration: true,
						MethodDefinition: true,
						ClassDeclaration: false,
						ArrowFunctionExpression: false,
						FunctionExpression: true,
					},
					contexts: [
						{
							context: "FunctionDeclaration",
							inlineCommentBlock: true,
							minLineCount: 12,
						},
						{
							context: "MethodDefinition",
							inlineCommentBlock: true,
							minLineCount: 12,
						},
						{
							context: "FunctionExpression",
							inlineCommentBlock: false,
							minLineCount: 12,
						},
					],
				},
			],
			"jsdoc/require-returns": "off",
			"jsdoc/require-param": "off",
		},
	},
);
