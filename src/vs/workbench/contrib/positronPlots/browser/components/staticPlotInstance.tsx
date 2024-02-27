/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { ZoomLevel } from 'vs/workbench/contrib/positronPlots/browser/components/zoomPlotMenuButton';
import { StaticPlotClient } from 'vs/workbench/services/positronPlots/common/staticPlotClient';

/**
 * StaticPlotInstanceProps interface.
 */
interface StaticPlotInstanceProps {
	plotClient: StaticPlotClient;
	zoom: ZoomLevel;
}

/**
 * StaticPlotInstance component. This component renders a single static (unchanging) plot
 * in the Plots pane.
 *
 * Unlike a DynamicPlotInstance, a StaticPlotInstance cannot redraw or resize itself. It renders
 * a static image at a fixed size.
 *
 * @param props A StaticPlotInstanceProps that contains the component properties.
 * @returns The rendered component.
 */
export const StaticPlotInstance = (props: StaticPlotInstanceProps) => {
	const [width, setWidth] = React.useState<number>(1);
	const [height, setHeight] = React.useState<number>(1);
	const imageWrapperRef = React.useRef<HTMLDivElement>(null);
	const [zoomMultiplier, setZoomMultiplier] = React.useState<number>(1);
	const [classes, setClasses] = React.useState<string>('');

	const onImgLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
		const img = event.target as HTMLImageElement;
		const width = img.naturalWidth;
		const height = img.naturalHeight;
		setWidth(width);
		setHeight(height);
	};

	React.useEffect(() => {
		switch (props.zoom) {
			case ZoomLevel.Fifty:
				setZoomMultiplier(.5);
				break;
			case ZoomLevel.SeventyFive:
				setZoomMultiplier(.75);
				break;
			case ZoomLevel.TwoHundred:
				setZoomMultiplier(2);
				break;
			case ZoomLevel.OneHundred:
			case ZoomLevel.Fill:
			default:
				setZoomMultiplier(1);
				break;
		}
	}, [props.zoom]);

	React.useLayoutEffect(() => {
		if (!imageWrapperRef.current || props.zoom === ZoomLevel.Fill) {
			return;
		}
		const { clientWidth, clientHeight } = imageWrapperRef.current;

		let classes = '';

		if (clientWidth < width * zoomMultiplier && clientHeight < height * zoomMultiplier) {
			classes += 'oversized';
		}

		setClasses(classes);
	});

	const getStyle = (): React.CSSProperties => {
		const zoomHeight = width / height >= 1;
		let style: React.CSSProperties = {
			width: '100%',
			height: '100%',
		};
		switch (props.zoom) {
			case ZoomLevel.Fifty:
			case ZoomLevel.SeventyFive:
			case ZoomLevel.OneHundred:
			case ZoomLevel.TwoHundred:
				if (zoomHeight) {
					style = {
						maxWidth: 'none',
						maxHeight: 'none',
						top: '50%',
						left: 0,
						transform: 'translateY(-50%)',
					};
				} else {
					style = {
						maxWidth: 'none',
						maxHeight: 'none',
						left: '50%',
						top: 0,
						transform: 'translateX(-50%)',
					};
				}
				break;
			case ZoomLevel.Fill:
			default:
				break;
		}
		return style;
	};

	const applyZoom = (value: number): string => {
		if (props.zoom !== ZoomLevel.Fill) {
			return `${value * zoomMultiplier}px`;
		}

		return '100%';
	};

	return (
		<div className='plot-instance static-plot-instance'>
			<div className='image-wrapper' ref={imageWrapperRef}>
				<img src={props.plotClient.uri}
					alt={props.plotClient.code ? props.plotClient.code : 'Plot ' + props.plotClient.id}
					className={classes}
					onLoad={onImgLoad}
					style={getStyle()}
					width={applyZoom(width)}
					height={applyZoom(height)}
				/>
			</div>
		</div>);
};
