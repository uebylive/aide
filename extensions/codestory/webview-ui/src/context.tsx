/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createContext, useContext, useState } from 'react';

const defaultExploration = 0;
type ExplorationContextType = {
	exploration: number;
	setExploration: (exploration: number) => void;
};
export const ExplorationContext = createContext<ExplorationContextType>({
	exploration: defaultExploration,
	setExploration: () => {},
});

type ExplorationContextProviderProps = {
	children: React.ReactNode;
	exploration: number;
};

export const ExplorationContextProvider = ({
	children,
	exploration,
}: ExplorationContextProviderProps) => {
	const [activeExploration, setActiveExploration] = useState(
		exploration || defaultExploration
	);

	const setExploration = (exploration: number) => {
		setActiveExploration(exploration);
	};

	return (
		<ExplorationContext.Provider
			value={{ exploration: activeExploration, setExploration }}
		>
			{children}
		</ExplorationContext.Provider>
	);
};

export const useExplorationContext = () => useContext(ExplorationContext);
